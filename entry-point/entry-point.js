module.exports = function (RED) {
    "use strict";
    const proxy = require("../lib/proxy")
    function upyHomeEntryPoint(config) {
        RED.nodes.createNode(this, config);
        let node = this;
        node._wired = config.wired;
        node._topic = config.topic;
        if(config.device)
            node._device = RED.nodes.getNode(config.device);
        if(node._device)
            proxy.registerEntryPoint(node)
        
        node.on('input', function(msg, send, done) {
            send = send || function() { node.send.apply(node,arguments) }
            send(msg);
            if (done) {
                done();
            }
        });
    }


    RED.nodes.registerType("entry-point", upyHomeEntryPoint);
    
}