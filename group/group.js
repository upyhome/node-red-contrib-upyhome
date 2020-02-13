module.exports = function (RED) {
    "use strict";

    const proxy = require("node-red-contrib-upyhome/lib/proxy")

    function upyHomeGroup(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node._topic = config.topic;
        proxy.registerTopic(node, node._topic);
        node._publishers = {}
        if(config.root) {
            setTimeout( function() {
                node.emit("input",{ discovery: true });
            }, 300);
        }
        node.on('input', function(msg, send, done) {
            // The node sends two message, route and status
            let routeMsg = null
            let status = null
            if (msg.status) { //publishers update
                if(msg.payload === 'connected') {
                    this._publishers[msg.sender] = null;
                } else if (msg.payload === 'disconnected') {
                    delete this._publishers[msg.sender]
                }
            } else if(msg.topic === this._topic) { // status update
                if (!this._publishers.has()) {
                    this._publishers[msg.sender] = null;
                }
                if (this._publishers[msg.sender] !== msg.payload) {
                    this._publishers[msg.sender] !== msg.payload;
                    status = {}
                    status.enabled = this._publishers.keys().length > 0
                    status.payload = 'on';
                    this._publishers.forEach(state => {
                        if (state === 'off')
                            status.payload  = 'off'
                    });
                }
            } else if(msg.discovery) { // Discovery
                routeMsg = msg;
                if (routeMsg.routes && Array.isArray(routeMsg.routes)) {
                    routeMsg.routes.unshift(this._topic);
                } else {
                    routeMsg.routes = [this._topic];
                }
            } else { // Simply pass message
                routeMsg = msg
            }
            send = send || function() { node.send.apply(node,arguments) }
            send([routeMsg, status])
            if (done) {
                done();
            }
        });
    }
    RED.nodes.registerType("group", upyHomeGroup);
}