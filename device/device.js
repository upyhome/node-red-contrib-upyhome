

module.exports = function (RED) {
    "use strict";
    const ws = require("ws");
    const proxy = require("../lib/proxy");

    function upyhomeDeviceNode(config) {
        //Create a RED node
        RED.nodes.createNode(this, config);
        var node = this;

        node.REPL_PWD = 'Password: ';
        node.REPL_CONNECTED = 'WebREPL connected';
        node.REPL_RAW = 'raw REPL; CTRL-B to exit';
        node.REPL_ERROR = 'Traceback (most recent call last):';
        node.REGEX_DI = "^#di#(\d):(P|C|L)";
        node.REGEX_DO = "^#do#(\d):(1|0)";

        node.tout = null;
        node.proxy = proxy;
        //Store local copies of the node configuration (as defined in the .html)
        node.name = config.name;
        console.debug(node.name);
        node.ip = config.ip;
        node.port = config.port;
        console.debug(node.ip+":"+node.port);
        node.password = config.password;
        node._autoconnect = config.autoconnect || false;
        node.autoping = config.autoping || false;
        node.queue = config.queue ||  false;
        node.startScript = config.init || false;
        node.runFisrt = node.startScript ? true: false;
        console.debug("autoping="+node.autoping);
        console.debug("queue="+node.queue);
        
        node.isAlive = false;
        node.isPing = false;
        node.pausePing = node.runFisrt;
        node.retry = true;

        node._commandBuffer = [];
        node._prompt = false;
        //Handler structure, arrays with one or two identifiers
        node._nodeHandlers = {
            device: [],
            receiver: []
        };

        this.startconn = function () {    // Connect to remote endpoint
            node._commandBuffer = [];
            node.debug('start connection');
            node.broadcastInfo('connecting')
            //node.connectionStatus(false);
            if (node.socket) {
                node.socket.terminate;
                node.socket = null;
            }
            if (node.tout) {
                clearTimeout(node.tout);
                node.tout = null;
            }
            if (node.ping) {
                clearInterval(node.ping);
                node.ping = null;
            }

            node.needAuth = node.password && node.password.length > 0;
            node.rawREPL = false;
            var options = {};
            var url = "ws://" + node.ip + ":" + node.port;
            var socket = new ws(url, options);
            socket.setMaxListeners(0);
            node.socket = socket; // keep for closing
            handleConnection(socket);
        }

        function handleConnection(/*socket*/socket) {
            var id = (1 + Math.random() * 4294967295).toString(16);

            socket.on('open', function () {
                node.debug('socket:open');
                node.isAlive = true;
                node.isPing = true;
                node.emit('opened', { count: '', id: id });
                node.ping = setInterval(function ping() {
                    if(node.pausePing)
                        return;
                    if (node.isPing === false) {
                        node.debug('!ping timeout! closing socket');
                        return node.socket.terminate();
                    }
                    node.isPing = false;
                    if(node.autoping) {
                        node.sendRaw("ping()");
                    }
                }, 3000);
            });
            socket.on('close', function () {
                node.isAlive = false;
                node.debug('socket:close');
                node.connectionStatus(false);
                node.emit('closed', { count: '', id: id });
                clearInterval(node.ping);
                if (!node.closing && node.retry) {
                    clearTimeout(node.tout);
                    node.tout = setTimeout(function () {
                        node.debug('reconnect function')
                        node.startconn();
                    }, 3000);
                }
            });
            socket.on('message', function (data, flags) {
                node.handleEvent(id, socket, 'message', data, flags);
            });
            socket.on('error', function (err) {
                node.isAlive = false;
                node.debug('socket:error');
                node.emit('erro', { err: err, id: id });
                ndode.broadcastInfo('disconnected')
            });
        }
        node.on("close", function (removed, done) {
            if (removed) {

            } else {
                node.closing = true;
                node.isAlive = false;
                node._nodeHandlers = {
                    device: [],
                    receiver: []
                };
                node.socket.terminate();
                if (node.tout) {
                    clearTimeout(node.tout);
                    node.tout = null;
                }
                if (node.ping) {
                    clearInterval(node.ping);
                    node.ping = null;
                }
            }
            if (done) {
                done();
            }
        });
        node.closing = false;
        // start connection
        if (node._autoconnect)
            node.startconn(); 
        }
    RED.nodes.registerType("device", upyhomeDeviceNode);

    //Handle websocket incoming data 
    upyhomeDeviceNode.prototype.handleEvent = function (id,/*socket*/socket,/*String*/event,/*Object*/data,/*Object*/flags) {
        //this.debug(data); 
        var msg;
        if (this.needAuth && data === this.REPL_PWD) {
            //Send password
            this.socket.send(this.password + '\x0D');
            this.needAuth = false;
        } else if (!this.rawREPL && data.includes(this.REPL_CONNECTED)) {
            //Enter RAW REPL
            this.socket.send('\x0D\x01');
        } else if (!this.rawREPL && data.includes(this.REPL_RAW)) {
            //Send status connected on first input
            this.rawREPL = true;
            this.broadcastInfo('connected')
        } else if (this.rawREPL) {
            if (data === 'OK') {
                //The command if successfully executed
                //this.broadcast('#status=[ready]');
            } else if (data.length === 1) {
                if (data === '>') {
                    if(this.runFisrt) {
                        this.socket.send(this.startScript + "\x04");
                        this.runFisrt = false;
                        this.pausePing = false;
                    }
                    //send REPL ACK / ready to receive message
                    if(this.queue) {
                        if(this._commandBuffer.length == 0) {
                            this._prompt = true;
                        } else {
                            this.socket.send(this._commandBuffer.shift());
                            this._prompt = false;
                        }
                    }
                }
            } else if (data.length > 2) {
                if (data === '#pong') {
                    this.isPing = true;
                } else {
                    this.broadcast(msg)
                }
            }
        }
    }

    upyhomeDeviceNode.prototype.startConnection = function () {
        if (!this.isAlive) {
            this.retry = true;
            this.startconn();
        }
    }

    upyhomeDeviceNode.prototype.stopConnection = function () {
        this.retry = false;
        if (this.isAlive) {
            this.socket.terminate();
            if (this.tout) {
                clearTimeout(this.tout);
                this.tout = null;
            }
            if (this.ping) {
                clearInterval(this.ping);
                this.ping = null;
            }
        }
    }

    upyhomeDeviceNode.prototype.broadcastMsg = function (data) {
        //Get all used registered domains
        const all = Object.keys(this._nodeHandlers);
        //Remove unused domains
        const domains = all.filter(function (value, index, arr) {
            return !(value === "device" || value === "receiver");
        });
        //Construct the regex
        const regexStr = "^(.*(?<!'))=\\[(.*)\\]";
        const regex = RegExp(regexStr);
        const match = regex.exec(data);
        if (match !== null && match.length === 3) {
            const topic = match[1];
            const value = match[2];
            this.proxy.pull(this.name, topic, value)
        }
    }

    upyhomeDeviceNode.prototype.broadcastStatus = function (status) {
        this.proxy.pull(this.name, '', status, true)
    }

    upyhomeDeviceNode.prototype.sendRaw = function (data) {
        try {
            if(this.isAlive) {
                var msg = data + "\x04";
                if (this._prompt || !this.queue) {
                    this.socket.send(msg);
                    this._prompt = false;
                } else  {
                    this._commandBuffer.push(msg);
                }
            }
        } catch (err) {
            this.warn(RED._("websocket.errors.send-error") + " " + err.toString())
        }
    }
    upyhomeDeviceNode.prototype.send = function (topic, msg, arg=null) {
        //Check if arg exists
        let dat = "string" === typeof arg?  `'${arg}'`: `${arg}`;
        let cmd = `uph.exec('${topic}','${msg}',${arg? dat: 'None'})`;
        this.sendRaw(cmd);
    }
}