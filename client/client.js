

module.exports = function (RED) {
    "use strict";
    const ws = require("ws");


    function upyhomeClientNode(config) {
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
        //Store local copies of the node configuration (as defined in the .html)
        node.name = config.name;
        console.debug(node.name);
        node.ip = config.ip;
        node.port = config.port;
        console.debug(node.ip+":"+node.port);
        node.password = config.password;
        
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
            node.connectionStatus(false);
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
                    //node.debug('interval');
                    if (node.isPing === false) {
                        node.debug('!ping timeout! closing socket');
                        return node.socket.terminate();
                    }
                    node.isPing = false;
                    if(node.autoping) {
                        node.sendRaw("ping()");
                    } else {
                        node.pingStatus();
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
                // try to reconnect every 3 secs... bit fast ? 
            });
            socket.on('message', function (data, flags) {
                node.handleEvent(id, socket, 'message', data, flags);
            });
            socket.on('error', function (err) {
                node.isAlive = false;
                node.debug('socket:error');
                node.emit('erro', { err: err, id: id });
                node.connectionStatus(false);
                //clearTimeout(node.tout);
                //if(!node.tout)
                //    node.tout = setTimeout(function() { startconn(); }, 3000); // try to reconnect every 3 secs... bit fast ?
            });
        }


        node.closing = false;
        this.startconn(); // start outbound connection

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
    }
    RED.nodes.registerType("client", upyhomeClientNode);

    upyhomeClientNode.prototype.sendRaw = function (data) {
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

    //Handle websocket incoming data 
    upyhomeClientNode.prototype.handleEvent = function (id,/*socket*/socket,/*String*/event,/*Object*/data,/*Object*/flags) {
        this.debug(data); 
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
            this.connectionStatus(true);
        } else if (this.rawREPL) {
            if (data === 'OK') {
                //The command if successfully executed
                //this.broadcast(this._statusNodes, [null, null, { payload: true }] );
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
                            this.ackStatus();
                        } else {
                            this.socket.send(this._commandBuffer.shift());
                            this._prompt = false;
                        }
                    }
                }
            } else if (data.length > 2) {
                if (data === '#pong') {
                    this.debug("pinged");
                    this.isPing = true;
                } else {
                    //this.debug(data); 
                    this.checkDomain(data);
                    //This message could not be parsed redirected to generic in node
                    var msg = {
                        raw: this.rawREPL,
                        payload: data,
                        _session: { type: "websocket", id: id }
                    };
                    this.broadcast(this._nodeHandlers["receiver"], msg)
                }
                //
                //console.debug(data.length);

            }
        }
    }

    upyhomeClientNode.prototype._domainOutput = {
        di: function (identifier, val) {
            let out;
            if (val === 'P')
                out = [{ payload: true }, null, null];
            else if (val === 'C')
                out = [null, { payload: true }, null];
            else if (val === 'L')
                out = [null, null, { payload: true }];
            return out;
        },
        do: function (identifier, val) {
            return { payload: (val === '1' ? true : false) };
        },
        dir: function (identifier, val) {
            let out = { directory: identifier, payload: [] };
            val.split(',').forEach(function (value) {
                if (value !== 'null')
                    out.payload.push(value);
            });
            out.payload.sort();
            return out;
        },
        file: function (identifier, val) {
            let out = { file: identifier, payload: [] };
            let tmp = val.replace("'<BR>'", "<TBR>")
            let lines = tmp.split("<BR>");
            lines.forEach(function (line) {
                out.payload.push(line.replace("<TBR>", "'<BR>'"));
            });
            return out;
        }
    }

    upyhomeClientNode.prototype.startConnection = function () {
        if (!this.isAlive) {
            this.retry = true;
            this.startconn();
        }
    }
    upyhomeClientNode.prototype.stopConnection = function () {
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
    //Register / Unregister handler arrays
    upyhomeClientNode.prototype.registerArray = function (handlerArray, handler) {
        if (!(handlerArray && Array.isArray(handlerArray))) {
            return;
        }
        var add = true;
        for (let node of handlerArray) {
            if (node === handler) {
                add = false;
                break;
            }
        }
        if (add) {
            handlerArray.push(handler);
        }
    }

    upyhomeClientNode.prototype.unregisterArray = function (handlerArray, handler) {
        handlerArray.forEach(function (node, i) {
            if (node === handler) {
                handlerArray.splice(i, 1);
            }
        });
    }

    //Check // Register / Unregister components
    upyhomeClientNode.prototype.checkHandler = function (domain, identifier) {
        return this._nodeHandlers[domain]
            && ((identifier && this._nodeHandlers[domain][identifier])
                || Array.isArray(this._nodeHandlers[domain]));
    }
    //Check // Register / Unregister components
    upyhomeClientNode.prototype.getHandler = function (domain, identifier) {
        if (this._nodeHandlers[domain] && Array.isArray(this._nodeHandlers[domain]))
            return this._nodeHandlers[domain];
        if (identifier && this._nodeHandlers[domain][identifier] && Array.isArray(this._nodeHandlers[domain][identifier]))
            return this._nodeHandlers[domain][identifier];
        return null;
    }

    upyhomeClientNode.prototype.registerHandlerNode = function (domain, identifier, handler) {
        if (!this._nodeHandlers[domain]) {
            if (!identifier) {
                this._nodeHandlers[domain] = [];
            } else {
                this._nodeHandlers[domain] = {};
                this._nodeHandlers[domain][identifier] = [];
            }
        } else if (identifier) {
            if (!Array.isArray(this._nodeHandlers[domain][identifier]))
                this._nodeHandlers[domain][identifier] = [];
        }
        if (identifier) {
            this.registerArray(this._nodeHandlers[domain][identifier], handler);
        } else if (Array.isArray(this._nodeHandlers[domain])) {
            this.registerArray(this._nodeHandlers[domain], handler);
        }
        // Check output function, create a generic payload if not exists.
        if (!this._domainOutput[domain]) {
            this._domainOutput[domain] = function (identifier, val) {
                return { payload: { identifier: identifier, value: val } };
            };
        }

    }

    upyhomeClientNode.prototype.unregisterHandlerNode = function (domain, identifier, handler) {
        if (domain && this._nodeHandlers[domain]) {
            if (identifier && this._nodeHandlers[domain][identifier]) {
                this.unregisterArray(this._nodeHandlers[domain][identifier], handler);
            }
            else {
                this.unregisterArray(this._nodeHandlers[domain], handler);
            }
        }
    }

    upyhomeClientNode.prototype.connectionStatus = function (connected) {
        const handler = this.getHandler("device", null);
        if (handler) {
            this.broadcast(handler, [{ payload: connected }, null, null, null]);
        }
    }

    upyhomeClientNode.prototype.ackStatus = function () {
        const handler = this.getHandler("device", null);
        if (handler) {
            this.broadcast(handler, [null, { payload: true }, null, null]);
        }
    }
    upyhomeClientNode.prototype.resultStatus = function (result) {
        const handler = this.getHandler("device", null);
        if (handler) {
            this.broadcast(handler, [null, null, { payload: result }, null]);
        }
    }
    upyhomeClientNode.prototype.pingStatus = function () {
        const handler = this.getHandler("device", null);
        if (handler) {
            this.broadcast(handler, [null, null, null, { payload: "ping()" }]);
        }
    }


    upyhomeClientNode.prototype.checkDomain = function (data) {
        //Get all used registered domains
        const all = Object.keys(this._nodeHandlers);
        //Remove unused domains
        const domains = all.filter(function (value, index, arr) {
            return !(value === "device" || value === "receiver");
        });
        //Construct the regex
        const regexStr = "^#(" + domains.join('|') + "):(.*(?<!'))=\\[(.*)\\]";
        const regex = RegExp(regexStr);
        const match = regex.exec(data);
        if (match !== null && match.length === 4) {
            const domain = match[1];
            const identifier = match[2];
            const val = match[3];
            // Contruct the response and send it the domain node
            const handler = this.getHandler(domain, identifier);
            if (handler) {
                const out = this._domainOutput[domain](identifier, val);
                return this.broadcast(handler, out);
            }
        }
        return false;
    }

    upyhomeClientNode.prototype.broadcast = function (handlers, msg) {
        var sent = false;
        try {
            for (var i = 0; i < handlers.length; i++) {
                sent = true;
                handlers[i].send(msg);
            }
        } catch (err) {
            this.warn(RED._("broadcast error") + " " + err.toString())
        }
        return sent;
    }
}