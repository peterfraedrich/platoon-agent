# Platoon Agent

#### Service files
There are 3 different service types defined for the agent:
* http-status
* systemd
* cmd

Each service should have its own file in the `./services` folder and should be in JSON format.

##### HTTP-STATUS

Prototype:
```JavaScript
{
	"name" : "<str, service name>",
	"type" : "http-status",
	"url" : "<str, url to check>",
	"pass" : <int, expected status code>
}
```

The http-status check will perform a `GET` against the `url` and retrieve a status code. If the status code does not match the `pass` parameter, the test will fail.


##### SYSTEMD

Prototype:
```JavaScript
{
	"name" : "<str, service name>",
	"type" : "systemd",
	"unit_file" : "<name of unit file, ex. tomcat.service>",
	"pass" : "<active, inactive, unknown>"
}
```

The systemd check allows you to define whether a service should be running (active), stopped (inactive), or not present on the machine (unknown). If the `pass` parameter does not match the output of `systemd is-active <unit_file>` the test will fail.

##### CMD

Prototype:
```JavaScript
{
	"name" : "<str, service name>",
	"type" : "cmd",
	"command" : "<command to run in shell>",
	"pass" : "<int, number of characters of expected stdout output>"
}
```

The cmd check allows you to check the length of the stdout of a shell command and fail if the length is < `pass`. It is *highly recommended* that your command return a `0`-length stdout and that you set your `pass` to `1`. 