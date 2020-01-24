module.exports = function(RED) {

    "use strict";
    function upyhoneSenderNode(config) {
        
        RED.nodes.createNode(this, config);
        var node = this;

        this.clientConfig = RED.nodes.getNode(config.client);
        if (!this.clientConfig) {
            return this.error(RED._("websocket.errors.missing-conf"));
        }
        else {
            // TODO: nls
            this.clientConfig.on('opened', function(event) {
                node.status({
                    fill:"green",shape:"dot",text:RED._("websocket.status.connected",{count:event.count}),
                    event:"connect",
                    _session: {type:"websocket",id:event.id}
                });
            });
            this.clientConfig.on('erro', function(event) {
                node.status({
                    fill:"red",shape:"ring",text:"common.status.error",
                    event:"error",
                    _session: {type:"websocket",id:event.id}
                })
            });
            this.clientConfig.on('closed', function(event) {
                var status;
                if (event.count > 0) {
                    status = {fill:"green",shape:"dot",text:RED._("websocket.status.connected",{count:event.count})};
                } else {
                    status = {fill:"red",shape:"ring",text:"common.status.disconnected"};
                }
                status.event = "disconnect";
                status._session = {type:"websocket",id:event.id}
                node.status(status);
            });
        }
        this.on("input", function(msg, send, done) {
            var payload;
            if (!Buffer.isBuffer(msg.payload)) { // if it's not a buffer make sure it's a string.
                payload = RED.util.ensureString(msg.payload);
            }
            //node.debug(payload);     
            if (payload) {
                this.clientConfig.sendRaw(payload);
            }
            if(done) {
                done();
            }
            
        });
        this.on('close', function() {
            node.status({});
        });
    }
    RED.nodes.registerType("sender", upyhoneSenderNode);

}