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
    process = require('process')

////////////////////////////////////////////////////////// SETUP
var app = express();
var gc = ini.parse(fs.readFileSync('platoon-agent.conf', 'utf-8'))


////////////////////////////////////////////////////////// ALLOW XSS / CORS
var allowCrossDomain = function(req, res, next) {
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
    return Date().toString()
}

var log = function (msg) {
    var timestamp = ts()
    // exists is dep'd in node 0.12, use fs.access in 0.12 !
    if (fs.existsSync(gc.global.log) == true) {
        fs.appendFileSync(gc.global.log, timestamp + ' :: ' + msg + '\n')
    } else {
        fs.writeFileSync(gc.global.log, timestamp + ' :: ' + msg + '\n')
    }
    return
}

var load_service_list = function () {
    return fs.readdirSync('./services')
}

var type_cmd = function (svc, callback) {
    var stime = process.hrtime()
    cmd(svc.command, function (err, stdout, stderr) {
        var diff = (process.hrtime(stime)[1] / 1000000).toFixed(2)
        if (!err) {
            callback(null, stdout, diff)
        } else {
            callback(stdout, null, diff)
        }
    })
}

var type_http_status = function (svc, callback) {
    var stime = process.hrtime()
    try {
        request(svc.url, function (err, res, body) {
            var diff = (process.hrtime(stime)[1] / 1000000).toFixed(2)
            if (!err) {
                return callback(null, res.statusCode, diff)
            } else {
                return callback('err', null, diff)
            }
        })
    } catch (e) {
        var diff = process.hrtime(stime)
        return callback('err', null, diff)
    }
}

var type_systemd = function (svc, callback) {
    var stime = process.hrtime()
    cmd('systemctl is-active ' + svc.unit_file, function (err, stdout) {
        var diff = (process.hrtime(stime)[1] / 1000000).toFixed(2)
        if (stdout == 'active\n') {
            return callback(null, null, diff)
        } else {
            return callback('err', null, diff)
        }
    })
}

var check_service = function (filename, callback) {
    var fname = './services/' + filename
    var svc = JSON.parse(fs.readFileSync(fname, 'utf-8'))
    if (svc.type.toLowerCase() == 'cmd') {
        type_cmd(svc, function (err, stdout, diff) {
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
            if (svc.pass == status && !err) {
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
}   

////////////////////////////////////////////////////////// PUBLIC API
app.get('/healthcheck', function (req, res) {
    var stime = process.hrtime()
    var service_list = load_service_list()
    var results = {}
    results.services = {}
    async.each(service_list, function (s, callback) {
        check_service(s, function (err, svc, diff) {
            results.services[svc.name] = {}
            if (err) {
                results.services[svc.name].status = 'err'
                results.services[svc.name].ms = diff
                results.services[svc.name].object = svc
                return callback()
            } else {
                results.services[svc.name].status = 'ok'
                results.services[svc.name].ms = diff
                results.services[svc.name].object = svc
                return callback()
            }
        })
    },
    function () {
        results.ip = ip.address()
        results.hostname = os.hostname()
        results.ms = (process.hrtime(stime)[1] / 1000000).toFixed(2)
        res.send(results)
    })
})

app.get('/heartbeat', function (req, res) {
    res.sendStatus(200)
})

////////////////////////////////////////////////////////// SERVER
app.listen(gc.global.port, function () {
    console.log('Platoon agent listening on port ' + gc.global.port);
});