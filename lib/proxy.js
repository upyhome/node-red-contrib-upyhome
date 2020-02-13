/**
 * This file is part of upyHome
 * Copyright (c) 2020 ng-galien
 * Licensed under the MIT license:
 * http://www.opensource.org/licenses/mit-license.php
 * Project home:\ 
 * https://github.com/upyhome/upyhome
 * 
 * Singleton Proxy class for message routing between nodes and devices
 */

class Proxy {

    constructor() {
        this._routes = {};
        this._registry = {};
    }

    /**
     * Register a node for a topic.\
     * The topic must be unique, else replaced.
     * Note that a node can register multiple topics like a dispatcher node.
     * @param {Node}   node The node to register
     * @param {topic} topic Topic of the node
     */
    registerTopic(node, topic) {
        // TODO send warning message if the topic is not unique
        this._routes[topic] = node;
    }

    /**
     * Add a topic to a route in the registry
     * @param {String} registry The registry where to had
     * @param {String} topic The topic to add
     * @param {String} route 
     */
    addTopic(registry, topic, route) {
        let add = true;
        for (let index = 0; index < registry.length; index++) {
            const element = registry[index];
            if (element._topic == topic) {
                add = false;
                break;
            }
        }
        if(add)
            registry.push(route)
    }

    /**
     * Register a route for an endpoint's topic.\
     * We can advertise the parents in the route tree when the topic of 
     * the endpoint is triggered for change.\
     * The route is related to the endpoint's device.
     * @param {Node}    node The node to register.
     * @param {Array} routes The array of topics form the root node to the endpoint.
     */
    registerEndPoint(node, routes) {
        let topic = node._topic;
        let device = node._device;
        let topic_id = `${topic}@${device.name}`;
        if (! this._registry.hasOwnProperty(topic_id)) {
            this._registry[topic_id] = [];
        }
        routes.forEach(route => {
            this.addTopic(this._registry[topic_id], topic_id, this._routes[route]);
        });
        
    }

    /**
     * Register an entry point for a topic.\
     * An entry point can register only one topic.\
     * Message with the corresponding topic will routed to this node.
     * @param {Node}    node The entry point to register.
     */
    registerEntryPoint(node) {
        let device = node._device;
        let topic = node._topic;
        let topic_id = `${topic}@${device.name}`;
        if (!this._registry.hasOwnProperty(topic_id)) {
            this._registry[topic_id] = [node];
        } else {
            this._registry[topic_id].push(node);
        }
    }

    /**
     * Pull a topic from a device.\
     * The message is propagated thrown the registered nodes in registry.
     * @param {Node}    sender The device which pull the topic.
     * @param {String}  topic  Topic to pull.
     * @param {Object}  data   Arbitrary data for the topic.
     * @param {Boolean} topic  If set, the message give the status of the device.
     */
    pullTopic(sender, topic, data, status=false) {
        var topic_id = `${topic}@${sender}`;
        if (this._registry.hasOwnProperty(topic_id)) {
            this._registry[topic_id].forEach(node => {
                let msg = { status: status, topic: topic, payload: data }
                node.emit("input", msg);
            });
        }
    }
};

module.exports = new Proxy()