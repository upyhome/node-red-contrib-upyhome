

module.exports = function(RED) {
    "use strict";
    var ws = require("ws");
    
    
    function UpyhomeClientNode(config) {
        //Create a RED node
        RED.nodes.createNode(this, config);

        var node = this;

        node.REPL_PWD = 'Password: ';
        node.REPL_CONNECTED = 'WebREPL connected';
        node.REPL_RAW = 'raw REPL; CTRL-B to exit';
        node.REGEX_DI = "^#di#(\d):(P|C|L)";
        node.REGEX_DO = "^#do#(\d):(1|0)";

        node.tout = null;
        //Store local copies of the node configuration (as defined in the .html)
        node.name = config.name;
        //console.debug(node.name);
        node.ip = config.ip;
        //console.debug(node.ip);
        node.port = config.port;
        //console.debug(node.port);
        node.password = config.password;
        //console.debug(node.password);
        
        node._inputNodes = [];
        node._statusNodes = [];
        node._handlers = {
            "ai": {},
            "ao": {},
            "di": {},
            "do": {},
            "data": {},
            "driver": {} 
        }


        function startconn() {    // Connect to remote endpoint
            node.debug('start connection');
            node.connectionStatus(false);
            if(node.socket) {
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
            var url = "ws://" +node.ip+":"+node.port;
            var socket = new ws(url , options);
            socket.setMaxListeners(0);
            node.socket = socket; // keep for closing
            node.isAlive = false;
            handleConnection(socket);
        }

        function handleConnection(/*socket*/socket) {
            var id = (1+Math.random()*4294967295).toString(16);

            socket.on('open',function() {
                node.debug('socket:open');
                node.isAlive = true;
                node.emit('opened', {count: '',id: id});
                node.ping = setInterval(function ping() {
                    //node.debug('interval');
                    if (node.isAlive === false) 
                        return node.socket.terminate();
                    node.isAlive = false;
                    node.pingStatus();
                  }, 3000);
            });
            socket.on('close',function() {
                node.debug('socket:close');
                node.connectionStatus(false);
                node.emit('closed',{count:'',id:id});
                clearInterval(node.ping);
                if (!node.closing) {
                    clearTimeout(node.tout);
                    node.tout = setTimeout(function() { 
                        node.debug('reconnect function')
                        startconn(); 
                    }, 3000); 
                }
                // try to reconnect every 3 secs... bit fast ? 
            });
            socket.on('message',function(data,flags) {
                node.handleEvent(id,socket,'message',data,flags);
            });
            socket.on('error', function(err) {
                node.debug('socket:error');
                node.emit('erro',{err:err,id:id});
                node.connectionStatus(false);
                //clearTimeout(node.tout);
                //if(!node.tout)
                //    node.tout = setTimeout(function() { startconn(); }, 3000); // try to reconnect every 3 secs... bit fast ?
            });
        }

        
        node.closing = false;
        startconn(); // start outbound connection
    
        node.on("close", function() {
            node.closing = true;
            node.isAlive = false;
            node.socket.terminate();
            node._inputNodes = [];
            node._statusNodes = [];
            node._handlers = {
                "ai": {},
                "ao": {},
                "di": {},
                "do": {},
                "dat": {},
                "drv": {} 
            }
            if (node.tout) {
                clearTimeout(node.tout);
                node.tout = null;
            }
            if (node.tout) {
                clearInterval(node.ping);
                node.ping = null;
            }
        });
    }
    RED.nodes.registerType("uph-client",UpyhomeClientNode);



    UpyhomeClientNode.prototype.connect = function(/*Node*/handler) {
        
    }

    //Register / Unregister handler arrays
    UpyhomeClientNode.prototype.registerArray = function(handlerArray, handler) {
        handlerArray.push(handler);
    }
    UpyhomeClientNode.prototype.unregisterArray = function(handlerArray, handler) {
        handlerArray.forEach(function(node, i, inputNodes) {
            if (node === handler) {
                handlerArray.splice(i, 1);
            }
        });
    }

    //Register / Unregister components
    UpyhomeClientNode.prototype.checkComponent = function(domain, topic) {
        return this._handlers[domain]
            && this._handlers[domain][topic];
    }
    UpyhomeClientNode.prototype.registerComponentNode = function(domain, topic, handler) {
        if(this._handlers[domain]) {
            if(!this._handlers[domain][topic]) {
                this._handlers[domain][topic] = [];
            }
            this.registerArray(this._handlers[domain][topic], handler);
        }
    }
    UpyhomeClientNode.prototype.unregisterComponentNode = function(domain, topic, handler) {
        if(this._handlers[domain] && this._handlers[domain][topic]) {
            this.unregisterArray(this._handlers[domain][topic], handler);
        }
    }


    //Register / Unregister input
    UpyhomeClientNode.prototype.registerInputNode = function(/*Node*/handler) {
        this.registerArray(this._inputNodes, handler);
    }
    UpyhomeClientNode.prototype.removeInputNode = function(/*Node*/handler) {
        this.unregisterArray(this._inputNodes, handler);
    }

    //Register / Unregister status
    UpyhomeClientNode.prototype.registerSatusNode = function(/*Node*/handler) {
        this.registerArray(this._statusNodes, handler);
    }
    UpyhomeClientNode.prototype.removeSatusNode = function(/*Node*/handler) {
        this.unregisterArray(this._statusNodes, handler);
    }


    UpyhomeClientNode.prototype.handleEvent = function(id,/*socket*/socket,/*String*/event,/*Object*/data,/*Object*/flags) {
        //this.debug(data); 
        var msg;
        if(this.needAuth && data === this.REPL_PWD) {
            //Send password
            this.socket.send(this.password + '\x0D');
            this.needAuth = false;
        } else if(!this.rawREPL && data.includes(this.REPL_CONNECTED)) {
            //Enter RAW REPL
            this.socket.send('\x0D\x01');
        } else if(!this.rawREPL && data.includes(this.REPL_RAW)) {
            //Send status connected on first input
            this.rawREPL = true;
            this.connectionStatus(true);
        } else if(this.rawREPL) {
            if (data === 'OK') {
                //The command if successfully exceuted
                //this.broadcast(this._statusNodes, [null, null, { payload: true }] );
            } else if (data.length === 1) {
                if( data === '>') {
                    //send REPL ACK / ready to recieve message
                    this.ackStatus();
                }
            } else if (data.length > 2) {
                if( data === '#pong') {
                    this.isAlive = true;
                } else {
                    //this.debug(data); 
                    if(this.checkDI(data))
                        return;
                    if(this.checkDO(data))
                        return;
                    var msg = {
                        raw: this.rawREPL,
                        payload: data,
                        _session: {type:"websocket",id:id}
                    };
                    this.broadcast(this._inputNodes, msg)
                }
                //
                //console.debug(data.length);

            }
        }
    }

    UpyhomeClientNode.prototype.connectionStatus = function(connected) {
        this.broadcast(this._statusNodes, [{ payload: connected }, null, null, null] );
    } 

    UpyhomeClientNode.prototype.ackStatus = function() {
        this.broadcast(this._statusNodes, [null, { payload: true }, null, null] );
    } 
    UpyhomeClientNode.prototype.resultStatus = function(result) {
        this.broadcast(this._statusNodes, [null, null, { payload: result }, null] );
    } 
    UpyhomeClientNode.prototype.pingStatus = function() {
        this.broadcast(this._statusNodes, [null, null, null, { payload: "ping()" }] );
    } 

    UpyhomeClientNode.prototype.checkDI = function(data) {
        var regex = /^#di#(\d):(P|C|L)/g;
        var match = regex.exec(data);
        //this.debug(match);
        if (match !== null && match.length === 3) {
            var dinum = match[1];
            var dival = match[2];
            //this.debug(dinum+":"+dival);
            if(this.checkComponent("di", dinum)) {
                var out;
                if(dival === 'P')
                    out = [{ payload: true }, null, null];
                else if(dival === 'C')
                    out = [null, { payload: true }, null];
                else if(dival === 'L')
                    out = [null, null, { payload: true }];
                //this.debug(out);
                this.broadcast(this._handlers["di"][dinum], out);
                return true;
            } 
        } 
        return false;
        
    }

    UpyhomeClientNode.prototype.checkDO = function(data) {
        
        var regex = /^#do#(\d):(1|0)/g;
        var match = regex.exec(data);
        this.debug(match);
        if (match !== null && match.length === 3) {
            var donum = match[1];
            var doval = match[2];
            if(this.checkComponent("do", donum)) {
                var out = { payload: (doval === '1' ? true: false) };
                this.broadcast(this._handlers["do"][donum], out);
                return true;
            } 
        } 
        return false;
    }

    UpyhomeClientNode.prototype.checkData = function(data) {
        
        var regex = /^#datafile#(\d):(1|0)/g;
        var match = regex.exec(data);
        this.debug(match);
        if (match !== null && match.length === 3) {
            var donum = match[1];
            var doval = match[2];
            if(this.checkComponent("do", donum)) {
                var out = { payload: (doval === '1' ? true: false) };
                this.broadcast(this._handlers["do"][donum], out);
                return true;
            } 
        } 
        return false;
    }


    UpyhomeClientNode.prototype.broadcast = function(handlers, msg) {
        for (var i = 0; i < handlers.length; i++) {
            handlers[i].send(msg);
        }
    }

    UpyhomeClientNode.prototype.sendRaw = function(data) {
        try {
            var msg = data + "\x04";
            this.socket.send( msg );
        } catch(err) {
            this.warn(RED._("websocket.errors.send-error")+" "+err.toString())
        }
        
    }
}