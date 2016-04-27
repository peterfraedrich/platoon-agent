# Platoon Agent

Platoon is a server/agent model, HTTP-based micro-cluster healthcheck system that allows you to monitor arbitrary `services` via scripts and send notifications to arbitrary `notifiers` via scripts. 

Platoon uses MongoDB as a shared backend for all of your micro-clusters, which provides information to the `Platoon UI` server (under development).

### What is a micro-cluster?

For the purposes of this document, a micro-cluster is a collection of same-task hosts (hosts that perform the same function). An example of a micro-cluster would be a group of ten servers hosting copies of a single Java/Tomcat application.

## Platoon Agent

The Platoon Agent is the workder -- or the soldier -- of the micro-cluster. When it recives a healthcheck request from the Platoon server the agent executes the scripts in the `./services/` folder and reads their exit code. It then gathers all of the information from the service checks and passes it back to the Platoon server.

#### Configuration

The configuration for the Platoon Agent is found in the `platoon-agent.conf` file and looks like this:
```ini
[global]							
port = 5001							# the port the agent should listen on. this should match the port in the server config
maintenance = False					# [future] a manual-fail flag, useful for maintenance windows and set by maintctl CLI utility
log = /var/log/platoon-agent.log    # path to the agent log file
script_types = py,sh,pl,js			# allowed script types for the service checks
```

#### Services

`Services` are what the agent monitors and reports on and are defined by the scripts in the `./services/` folder in 1:1 ratio -- one script is equal to one service. The status of the service is defined by the exit code of the service script: 0 for pass, 1 for fail. No information is passed to the service scripts.

One example of a service script would be to check if a system service is running:
```shell
#!/bin/bash
STATUS = $(systemctl is-active httpd)
if [ $STATUS == 'false' ] || [ $STATUS == 'unknown' ]; then
	exit 1
fi
exit 0
``` 
The above example would return as failed (`exit 1`) if the `httpd` service is either not running or is not installed on the target host; otherwise it would return as passing (`exit 0`). While this is a very simple example, it shows that the scope of what is able to be checked is not limited to just system services, but rather can be virtually anything. 

**NOTE:** Service scripts should be executable without prepending the script runtime (ie, `./script.sh` instead of `bash script.sh`), be sure to put the script runtime (ex, `#!/usr/bin/python`) in the first line of the script and have the runtime in `$PATH`.


## FAQ

* **Can it support script types other than python, shell, perl, and javascript?**

	Yes. It can support any executable that returns an exit code. 

* **How many services can it support?**

	I don't know, really. How many services can you write?

* **Why scripts / why not [your favorite config/markdown/object method]?**

	The initial idea was to define services in JSON, but that turned out to be inflexible as the services would have to be pre-defined inside the code itself. Using scripts allows the admins greater flexibility on what to monitor and how. 

* **Can I monitor x service?**

	Sure, if you can write a script to do it. You are only limited by your imagination.