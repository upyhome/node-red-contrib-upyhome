module.exports = function (RED) {
    "use strict";
    const proxy = require("../lib/proxy").default

    function upyHomeDispatcher(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.topic = config.topic;
        node.msgCount = config.outputs.length;
        node.proxy = proxy
        node.proxy.registerTopic(this);
        node.status = new Array(node.msgCount).fill(false)
        node.forward = true

        node.on('input', function(msg, send, done) {
            send = send || function() { node.send.apply(node,arguments) }
            if (msg.next) {
                res = new Array(node.msgCount).fill(null)
                pos = -1;
                if (this.forward) {
                    for (let index = 0; index < this.status.length; index++) {
                        if(!this.status) {
                            pos = index;
                            break;
                        }
                    }
                    this.forward = pos >= 0;
                } else {
                    for (let index = this.status.length; index >= 0; index--) {
                        if(this.status) {
                            pos = index;
                            break;
                        }
                    }
                    this.forward = pos < 0;
                }
                if(this.forward) {
                    if (pos < 0)
                        pos = 0;
                    res[pos] = { payload: 'on' }
                } else {
                    if (pos < 0)
                        pos = this.msgCount;
                    res[pos] = { payload: 'off' }
                }
                send(res)
            } else if (msg.reset) {
                res = new Array(node.msgCount).fill({ payload: 'off' })
                send(res)
            } else if (msg.discovery) {
                res = new Array(node.msgCount)
                res = [];
                for (let index = 0; index < this.msgCount; index++) {
                    topic = this.topic+'_'+i;
                    routes = [topic];
                    if (msg.routes && Array.isArray(msg.routes)) {
                        routes = msg.routes.slice();
                        routes.push(topic);
                    }
                    res.push(routes)
                }
                send(res)
            }
            if (done) {
                done();
            }
        });
    }
    RED.nodes.registerType("dispatcher", upyHomeDispatcher);
    upyHomeDispatcher.prototype.push = function(msg) {
        arr = msg.topic.split('_');
        pos = parseInt(arr[1])
        this.status[pos] = (msg.payload=="1" || msg.payload=="on") 

    }
}