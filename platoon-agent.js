// healthcheck.js

////////////////////////////////////////////////////////// DEPS
var application_root = __dirname,
    express = require('express'),
    http = require('http'),
    sys = require('sys'),
    ini = require('ini'),
    errorhandler = require('errorhandler'),
    bodyParser = require('body-parser'),
    path = require('path'),
    fs = require('fs'),
    methodOverride = require('method-override'),
    request = require('request'),
    cmd = require('child_process').exec,
    async = require('async'),
    ip = require('ip'),
    os = require('os'),
    process = require('process'),
    util = require('util')

////////////////////////////////////////////////////////// SETUP
var startup_start = process.hrtime() // start the spool up timer
var app = express();
var gc = ini.parse(fs.readFileSync('platoon-agent.conf', 'utf-8'))


////////////////////////////////////////////////////////// ALLOW XSS / CORS
var allowCrossDomain = function(req, res, next) {
    /* 
        re-write headers to allow cross-domain access to our API's
    */
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
      res.header('Access-Control-Allow-Methods', '*');
      res.header('Access-Control-Allow-Headers', '*');
      res.header('Access-Control-Allow-Headers', 'X-Requested-With, Accept, Origin, Referer, User-Agent, Content-Type, Authorization');

      // intercept OPTIONS method
      if (req.method === 'OPTIONS') {
        res.send(200);
      }
      else {
        next();
      }
    };

    app.use(allowCrossDomain);   // make sure this is is called before the router
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: true}))
    app.use(methodOverride());
    app.use(errorhandler());
    app.use(express.static(path.join(application_root, "public")));

////////////////////////////////////////////////////////// PRIVATE LOGIC

var ts = function () {
    /* 
        returns a timestamp as a string, useful for things
    */
    return Date().toString()
}

var load_config = function () {
    /*
        callable function to load the config file into variable 'gc'
    */
    gc = ini.parse(fs.readFileSync('platoon-agent.conf', 'utf-8'))
}

var log = function (msg) {
    /*
        logging function; outputs a timestamp and logging message to the log file
        defined in the global config. creates a new log if none exist. also writes
        to stdout for use with journald.
    */
    var timestamp = ts()
    // exists is dep'd in node 0.12, use fs.access in 0.12 !
    if (fs.existsSync(gc.global.log) == true) {
        fs.appendFileSync(gc.global.log, timestamp + ' :: ' + msg + '\n')
    } else {
        fs.writeFileSync(gc.global.log, timestamp + ' :: ' + msg + '\n')
    }
    console.log(timestamp + ' :: ' + msg)
    return
}

var load_service_list = function () {
    /*
        reads the 'service' directory and generates a list of
        service definitions, returns an array. filters out
        files that don't end in .json
    */
    try {
       var files = fs.readdirSync('./services')
       var flist = []
       for (i = 0; i < files.length; i++) {
            if (files[i].split('.')[1] == 'json') {
                flist.push(files[i])
            } 
       }
       return flist
    } catch (e) {
        log(e)
        return []
    }
}

var type_cmd_length = function (svc, callback) {
    /*
        method for the 'cmd' service type. returns stdout from the
        command that was run and the total time it took to run it.
    */
    var stime = process.hrtime()
    cmd(svc.command, function (err, stdout, stderr) {
        var diff = (process.hrtime(stime)[1] / 1000000).toFixed(2)
        if (!err) {
            callback(null, stdout, diff)
        } else {
            log(err)
            callback(stdout, null, diff)
        }
    })
}

var type_http_status = function (svc, callback) {
    /*
        method for the http-status service type. gets the HTTP status
        code with an HTTP GET. returns the status vode and the total
        time to took for the request.
    */
    var stime = process.hrtime()
    try {
        request({url : svc.url, timeout : 2000}, function (err, res, body) {
            var diff = (process.hrtime(stime)[1] / 1000000).toFixed(2)
            if (!err) {
                return callback(null, res.statusCode, diff)
            } else {
                log('Bad HTTP GET. [ ' + svc.name + '; ' + svc.url +' ]')
                return callback('err', null, diff)
            }
        })
    } catch (e) {
        var diff = process.hrtime(stime)
        log(e)
        return callback('err', null, diff)
    }
}

var type_systemd = function (svc, callback) {
    /*
        the systemd service type. uses 'systemctl is-active <service>'
        command to check if a service is running or not. returns
        a null value and the total command run time.
    */
    var stime = process.hrtime()
    cmd('systemctl is-active ' + svc.unit_file, function (err, stdout, stderr) {
        var diff = (process.hrtime(stime)[1] / 1000000).toFixed(2)
        if (stdout == svc.pass.toString()+'\n') {
            return callback(null, 'ok', diff)
        } else { 
            log('Systemd result mismatch. [ result : ' + stdout.split('\n')[0] + '; expected : ' + svc.pass + ' ]')
            return callback('err', 'err', diff)
        }
    })
}

var type_cmd = function (svc, callback) {
    /*
        the cmd service type. runs a provided command and compares to the 
        expected output. if != then fail, if == then pass.
    */
    var stime = process.hrtime()
    cmd(svc.command, function (err, stdout, stderr) {
        var diff = (process.hrtime(stime)[1] / 1000000).toFixed(2)
        if (stdout == svc.pass.toString()+'\n') {
            return callback(null, 'ok', diff)
        } else {
            log('cmd result mismatch. [ result : ' + stdout.split('\n')[0] + '; expected : ' + svc.pass.toString() + ' ]')
            return callback('err','err', diff)
        }
    }) 
}

var check_service = function (filename, callback) {
    /*
        the guts of the app. it takes the services defined in the
        service files and runs them through the service checks 
        depending on what service type it is. returns the
        service object and the total run time of each
        check.
    */
    try {
        var fname = './services/' + filename
        var svc = JSON.parse(fs.readFileSync(fname, 'utf-8'))
        if (svc.type.toLowerCase() == 'cmd-length') {
            type_cmd_length(svc, function (err, stdout, diff) {
                if (svc.pass <= stdout.length && !err) {
                    return callback(null, svc, diff)
                } else {
                    return callback(stdout, svc, diff)
                }
            })
        }
        else if (svc.type.toLowerCase() == 'http-status') {
            type_http_status(svc, function (err, status, diff) {
                if (svc.pass == status && !err) {
                    return callback(null, svc, diff)
                } else {
                    return callback('err', svc, diff)
                }
            })
        }
        else if (svc.type.toLowerCase() == 'systemd') {
            type_systemd(svc, function (err, status, diff) {
                if (status == 'ok' && !err) {
                    return callback(null, svc, diff)
                } else {
                    return callback(status, svc, diff)
                }
            })
        }
        else if (svc.type.toLowerCase() == 'cmd') {
            type_cmd(svc, function (err, status, diff) {
                if (status == 'ok' && !err) {
                    return callback(null, svc, diff)
                } else {
                    return callback(status, svc, diff)
                }                
            })
        }
        else {
            log('Service type ' + svc.type + ' not recognized. Value should be http-status, cmd, or systemd.')
            return callback('err', svc, null)
        }
    } catch (e) {
        log(e)
        return callback('err', null, null)
    }
}   

////////////////////////////////////////////////////////// PUBLIC API

app.get('/heartbeat', function (req, res) {
    /* 
        dumb heartbeat function to check if the app is running. will
        be used in lieu of a ping check for the platoon master.
    */
    try {
        res.sendStatus(200)
    } 
    catch (e) {
        log(e)
        res.send()
    }
})

app.get('/healthcheck', function (req, res) {
    /*
        when a new request comes in, it takes the list of services
        files and runs them through the check_service method. appends
        the results to a 'results' object which is then returned to
        the requester as JSON.
    */
    try {
        var stime = process.hrtime()
        var service_list = load_service_list()
        if (service_list.length > 0) {
            var results = {}
            results.services = []
            load_config()
            async.each(service_list, function (s, callback) {
                check_service(s, function (err, svc, diff) {
                    if (err) {
                        var svcObj = {
                            "name" : svc.name,
                            "status" : 'err',
                            "ms" : diff,
                            "object" : svc
                        }
                    } else {
                        var svcObj = {
                            "name" : svc.name,
                            "status" : 'ok',
                            "ms" : diff,
                            "object" : svc
                        }
                    }
                    results.services.push(svcObj)
                    return callback()
                })
            },
            function () {
                results.ip = ip.address()
                results.hostname = os.hostname()
                results.ms = (process.hrtime(stime)[1] / 1000000).toFixed(2)
                log('Completed healthcheck in ' + results.ms + 'ms for services ' + service_list.toString())
                res.send(results)
            })
        } else {
            var results = {
                "ip" : ip.address(),
                "hostname" : os.hostname(),
                "ms" : (process.hrtime(stime)[1] / 1000000).toFixed(2),
                "services" : []
            }
            log('No services defined. Nothing to do. (' + results.ms + 'ms)')
            res.send(results)
        }
        
    }
    catch (e) {
        log(e)
        res.send()
    }
})

////////////////////////////////////////////////////////// SERVER
app.listen(gc.global.port, function () {
    /*
        start the express app and log boot time to the logger.
    */
    try {
        log('Platoon agent started up in ' + (process.hrtime(startup_start)[1] / 1000000).toFixed(2) + 'ms') // log the startup and report spool up time
        console.log('Platoon agent listening on port ' + gc.global.port);
    }
    catch (e) {
        log(e)
    }
    
});