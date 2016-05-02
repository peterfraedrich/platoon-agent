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
    thread = require('child_process').spawn,
    async = require('async'),
    ip = require('ip'),
    os = require('os'),
    process = require('process'),
    util = require('util')

////////////////////////////////////////////////////////// SETUP
var startup_start = process.hrtime() // start the spool up timer
var app = express();
var gc = ini.parse(fs.readFileSync('platoon-agent.conf', 'utf-8'))
gc.global.script_types = gc.global.script_types.split(',') // convert comma list to array because ini doesn't like arrays


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
        service definitions, returns an array. filters out any
        file extensions not defined in platoon-agent.conf:script_types
    */
    try {
       var files = fs.readdirSync('./services')
       var flist = []
       for (i = 0; i < files.length; i++) {
            var file = files[i].split('.')[1]
            if (gc.global.script_types.indexOf(file) != -1) {
                flist.push(files[i])
            } 
       }
       return flist
    } catch (e) {
        log(e)
        return []
    }
}

var check_service = function (s, callback) {
    /*
        spawns a worker thread to run the script
        and evaluates the return code.
        0 = OK
        1 = ERR
    */
    try {
        var stime = process.hrtime() // start the clock
        var t = thread('./services/' + s, [])
        t.stderr.on('data', function (data) {
            log(s + ' [ ' + data.toString().replace(/\n/, '') + ' ]') 
        })
        t.stdout.on('data', function (data) {
            log(s + ' [ ' + data.toString().replace(/\n/, '') + ' ]')
        })
        t.on('close', function (code) {
            if (code == 0) {
                return callback(null, (process.hrtime(stime)[1] / 1000000).toFixed(2))
            } else {
                log(s + ' [ ' + code + ' ]')
                return callback(code, (process.hrtime(stime)[1] / 1000000).toFixed(2))
            }
            
        })
    } catch (e) {
        log(e.toString().replace(/\n/, ''))
        return callback(e, (process.hrtime(stime)[1] / 1000000).toFixed(2))
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
            results.ip = ip.address()
            results.hostname = os.hostname()
            results.services = []
            load_config()
            async.each(service_list, function (s, callback) {
                check_service(s, function (err, diff) {
                    if (err) {
                        var svcObj = {
                            "name" : s,
                            "status" : 'err',
                            "ms" : diff,
                        }
                    } else {
                        var svcObj = {
                            "name" : s,
                            "status" : 'ok',
                            "ms" : diff,
                        }
                    }
                    results.services.push(svcObj)
                    return callback()
                })
            },
            function () {
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