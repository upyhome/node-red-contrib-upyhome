module.exports = function(RED) {
    "use strict";

    function upyhomeDONode(config) {

        RED.nodes.createNode(this, config);
        var node = this;
        this.clientConfig = RED.nodes.getNode(config.client);
        this.domain = config.domain;
        this.indentifier = config.indentifier;
        if (this.clientConfig) {
            this.clientConfig.registerHandlerNode(this.domain, this.indentifier, this);
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
                });
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
        } else {
            this.error(RED._("websocket.errors.missing-conf"));
        }
        node.on('close', function(removed, done) {
            if(removed) {
                if (node.clientConfig) {
                    node.clientConfig.unregisterHandlerNode(node.domain, node.indentifier, this);
                }
            }
            node.status({});
            done();
        });
        node.on('input', function(msg, send, done) {
            if(msg.toggle) {
                const msg = 'douts["' + this.indentifier + '"].toggle();'
                this.clientConfig.sendRaw(msg);
            } else if (msg.payload === true) {
                const msg = 'douts["' + this.indentifier + '"].on();'
                this.clientConfig.sendRaw(msg);
            } else if (msg.payload === false) {
                const msg = 'douts["' + this.indentifier + '"].off();'
                this.clientConfig.sendRaw(msg);
            }
            if (done) {
                done();
            }
        });
    }

    RED.nodes.registerType("digital-output", upyhomeDONode);
}