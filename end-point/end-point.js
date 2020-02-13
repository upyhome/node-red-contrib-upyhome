module.exports = function (RED) {
    "use strict";
    const proxy = require("../lib/proxy");
    function upyHomeEndPoint(config) {

        RED.nodes.createNode(this, config);
        var node = this;
        node._topic = config.topic;
        node._device = RED.nodes.getNode(config.device);
        node.on('input', function(msg, send, done) {
            if(msg.discovery) {
                proxy.registerEndPoint(this, msg.routes);
            } else {
                this._device.send(this._topic, msg.payload)
            }
            if (done) {
                done();
            }
        });
    }
    RED.nodes.registerType("end-point", upyHomeEndPoint);
    
}