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
    cmd = require('child_process').exec

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

var type_cmd = function (command, callback) {
    cmd(command, function (err, stdout, stderr) {
        if (!err) {
            callback(null, stdout)
        } else {
            callback(err)
        }
    })
}

var type_httpd_status = function (url, callback) {
    try {
        request(url, function (err, res, body) {
            if (!err) {
                return callback(null, res.statusCode)
            } else {
                return callback(err)
            }
        })
    } catch (e) {
        return callback(e)
    }
}

var type_systemd = function (svc_name, callback) {
    cmd('systemctl is-active ' + svc_name, function (err, stdout) {
        if (stdout == 'active\n') {
            return callback(null)
        } else {
            return callback(stdout)
        }
    })
}

var check = function (callback) {
    var status = {}
    var services = gc.service.list.split(',')
    for (var key in gc) {
        if (gc.hasOwnProperty(key)) {
            for (i = 0; i < services.length; i++) {
                if (key = services[i]) {
                    if (gc[key].type == 'cmd') {
                        type_cmd(gc[key].svc_check, function (err, data) {
                            if (data.length < gc[key].pass || err) {
                                status.gc[key] = {}
                                status.gc[key].status = false
                            } else {
                                status.gc[key].status = true
                            }
                        })
                    }
                    else if (gc[key].type == 'http_status') {
                        type_httpd_status(gc[key].url, function (err, data) {
                            if (err) {
                                status.gc[key] = {}
                                status.gc[key].status = false
                            } else {
                                if (data == gc[key].pass) {
                                    status.gc[key] = {}
                                    status.gc[key].status = false
                                } else {
                                    status.gc[key] = {}
                                    status.gc[key].status = true
                                }
                            }
                        })
                    }
                    else if (gc[key].type == 'systemd') {
                        type_systemd(gc[key].name, function (err, data) {
                            if (err) {
                                status.gc[key] = {}
                                status.gc[key].status = false
                            } else {
                                status.gc[key] = {}
                                status.gc[key].status = true
                            }
                        })
                    }
                }
            }
        }
        return callback(null, status)
    }
    //
    for (i = 0; i < services.length; i++) {
        

    }

}

////////////////////////////////////////////////////////// PUBLIC API
app.get('/healthcheck', function (req, res) {
    check(function (status) {
        console.log(status)
    })
})

app.get('/heartbeat', function (req, res) {
    res.sendStatus(200)
})

app.get('/clustercheck', function (req, res) {
    // do clustercheck
})

////////////////////////////////////////////////////////// SERVER
app.listen(gc.global.port, function () {
    console.log('Healthcheck service listening on port ' + gc.global.port);
});