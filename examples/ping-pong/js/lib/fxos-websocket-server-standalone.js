(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.FxOSWebSocket = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _EventDispatcher = require('EventDispatcher');

var _EventDispatcher2 = _interopRequireDefault(_EventDispatcher);

var _frameBufferEs6 = require('./frame-buffer.es6');

var _frameBufferEs62 = _interopRequireDefault(_frameBufferEs6);

var _utilsEs6 = require('./utils.es6');

var _utilsEs62 = _interopRequireDefault(_utilsEs6);

/**
 * Sequence used to separate HTTP request headers and body.
 * @const {string}
 */
var CRLF = '\r\n';

/**
 * Magic GUID defined by RFC to concatenate with web socket key during
 * websocket handshake.
 * @const {string}
 */
var WEBSOCKET_KEY_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * Websocket handshake response template string, {web-socket-key} should be
 * replaced with the appropriate key.
 * @const {string}
 */
var WEBSOCKET_HANDSHAKE_RESPONSE = 'HTTP/1.1 101 Switching Protocols' + CRLF + 'Connection: Upgrade' + CRLF + 'Upgrade: websocket' + CRLF + 'Sec-WebSocket-Accept: {web-socket-key}' + CRLF + CRLF;

/**
 * Enumeration of all possible operation codes.
 * @enum {number}
 */
var OperationCode = {
  CONTINUATION_FRAME: 0,
  TEXT_FRAME: 1,
  BINARY_FRAME: 2,
  CONNECTION_CLOSE: 8,
  PING: 9,
  PONG: 10
};

/**
 * Extracts HTTP header map from HTTP header string.
 * @param {string} httpHeaderString HTTP header string.
 * @returns {Map.<string, string>} HTTP header key-value map.
 */
function getHttpHeaders(httpHeaderString) {
  var httpHeaders = httpHeaderString.trim().split(CRLF);
  return new Map(httpHeaders.map(function (httpHeader) {
    return httpHeader.split(':').map(function (entity) {
      return entity.trim();
    });
  }));
}

/**
 * Performs WebSocket HTTP Handshake.
 * @param {TCPSocket} tcpSocket Connection socket.
 * @param {Uint8Array} httpRequestData HTTP Handshake data array.
 * @returns {Map.<string, string>} Parsed http headers
 */
function performHandshake(tcpSocket, httpRequestData) {
  var httpHeaders = getHttpHeaders(_utilsEs62['default'].arrayToString(httpRequestData).split(CRLF + CRLF)[0]);

  var key = _utilsEs62['default'].stringToArray(httpHeaders.get('Sec-WebSocket-Key') + WEBSOCKET_KEY_GUID);

  var subtle = window.crypto.subtle;
  return subtle.digest({ name: 'SHA-1' }, key).then(function (hashArrayBuffer) {
    var webSocketKey = btoa(_utilsEs62['default'].arrayToString(new Uint8Array(hashArrayBuffer)));
    var arrayResponse = _utilsEs62['default'].stringToArray(WEBSOCKET_HANDSHAKE_RESPONSE.replace('{web-socket-key}', webSocketKey));

    tcpSocket.send(arrayResponse.buffer, 0, arrayResponse.byteLength);

    return httpHeaders;
  });
}

/**
 * Creates outgoing websocket message frame.
 * @param {Number} opCode Frame operation code.
 * @param {Uint8Array} data Data array.
 * @param {Boolean} isComplete Indicates if frame is completed.
 * @param {Boolean?} isMasked Indicates if frame data should be masked.
 * @returns {Uint8Array} Constructed frame data.
 */
function createMessageFrame(opCode, data, isComplete, isMasked) {
  var dataLength = data && data.length || 0;
  var dataOffset = isMasked ? 6 : 2;

  var secondByte = 0;
  if (dataLength >= 65536) {
    dataOffset += 8;
    secondByte = 127;
  } else if (dataLength > 125) {
    dataOffset += 2;
    secondByte = 126;
  } else {
    secondByte = dataLength;
  }

  var outputBuffer = new Uint8Array(dataOffset + dataLength);

  // Writing OPCODE, FIN and LENGTH
  outputBuffer[0] = isComplete ? opCode | 128 : opCode;
  outputBuffer[1] = isMasked ? secondByte | 128 : secondByte;

  // Writing DATA LENGTH
  switch (secondByte) {
    case 126:
      _utilsEs62['default'].writeUInt16(outputBuffer, dataLength, 2);
      break;
    case 127:
      _utilsEs62['default'].writeUInt32(outputBuffer, 0, 2);
      _utilsEs62['default'].writeUInt32(outputBuffer, dataLength, 6);
      break;
  }

  if (isMasked && dataLength) {
    var mask = _utilsEs62['default'].generateRandomMask();

    // Writing MASK
    outputBuffer.set(mask, dataOffset - 4);

    _utilsEs62['default'].mask(mask, data);
  }

  for (var i = 0; i < dataLength; i++) {
    outputBuffer[dataOffset + i] = data[i];
  }

  return outputBuffer;
}

var privates = {
  tcpServerSocket: Symbol('tcp-socket'),
  onTCPServerSocketConnect: Symbol('onTCPServerSocketConnect'),
  onTCPServerSocketClose: Symbol('onTCPServerSocketClose'),

  tcpSocket: Symbol('tcpSocket'),
  onTCPSocketData: Symbol('onTCPSocketData'),
  onTCPSocketClose: Symbol('onTCPSocketClose'),

  clients: Symbol('clients'),
  frameBuffer: Symbol('frameBuffer'),

  onMessageFrame: Symbol('onMessageFrame')
};

/**
 * WebSocketServer constructor that accepts port to listen on.
 * @param {Number} port Number to listen for websocket connections.
 */

var WebSocketServer = (function () {
  function WebSocketServer(port) {
    _classCallCheck(this, WebSocketServer);

    _EventDispatcher2['default'].mixin(this, ['message', 'stop']);

    var tcpServerSocket = navigator.mozTCPSocket.listen(port, {
      binaryType: 'arraybuffer'
    });

    this[privates.tcpServerSocket] = tcpServerSocket;
    this[privates.clients] = new Map();
    this[privates.frameBuffer] = new _frameBufferEs62['default']();

    this[privates.onMessageFrame] = this[privates.onMessageFrame].bind(this);

    tcpServerSocket.onconnect = this[privates.onTCPServerSocketConnect].bind(this);
    tcpServerSocket.onerror = this[privates.onTCPServerSocketClose].bind(this);
  }

  _createClass(WebSocketServer, [{
    key: 'send',

    /**
     * Send data to the connected client
     * @param {ArrayBuffer|Array|string} data Data to send.
     */
    value: function send(data) {
      if (!ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer)) {
        if (typeof data === 'string') {
          data = new Uint8Array(_utilsEs62['default'].stringToArray(data));
        } else if (Array.isArray(data)) {
          data = new Uint8Array(data);
        } else {
          throw new Error('Unsupported data type: ' + typeof data);
        }
      }

      var dataFrame = createMessageFrame(OperationCode.BINARY_FRAME, data, true, /* isCompleted */false /* isMasked */
      );

      this[privates.tcpSocket].send(dataFrame.buffer, 0, dataFrame.length);
    }
  }, {
    key: 'stop',

    /**
     * Destroys socket connection.
     */
    value: function stop() {
      var tcpSocket = this[privates.tcpSocket];
      if (tcpSocket) {
        tcpSocket.close();
        this[privates.onTCPSocketClose]();
      }

      var tcpServerSocket = this[privates.tcpServerSocket];
      if (tcpServerSocket) {
        tcpServerSocket.close();
        this[privates.onTCPServerSocketClose]();
      }

      this[privates.clients].clear();
    }
  }, {
    key: privates.onTCPServerSocketConnect,
    value: function (tcpSocket) {
      this[privates.tcpSocket] = tcpSocket;

      this[privates.frameBuffer].on('frame', this[privates.onMessageFrame]);

      tcpSocket.ondata = this[privates.onTCPSocketData].bind(this);
      tcpSocket.onclose = tcpSocket.onerror = this[privates.onTCPSocketClose].bind(this);
    }
  }, {
    key: privates.onTCPSocketData,

    /**
     * MozTcpSocket data handler.
     * @param {TCPSocketEvent} socketEvent TCPSocket data event.
     */
    value: function (socketEvent) {
      var clients = this[privates.clients];
      var tcpSocket = this[privates.tcpSocket];

      var frameData = new Uint8Array(socketEvent.data);

      // If we don't have connection info from this host let's perform handshake
      // Currently we support only ONE client from host.
      if (!clients.has(tcpSocket.host)) {
        performHandshake(tcpSocket, frameData).then(function (handshakeResult) {
          if (handshakeResult) {
            clients.set(tcpSocket.host, handshakeResult);
          }
        });
        return;
      }

      this[privates.frameBuffer].put(frameData);
    }
  }, {
    key: privates.onMessageFrame,

    /**
     * Process WebSocket incoming frame.
     * @param {Uint8Array} frame Message frame data in view of Uint8Array.
     */
    value: function (frame) {
      var _this = this;

      var buffer = this[privates.frameBuffer];

      buffer.get(2).then(function (controlData) {
        var state = {
          isCompleted: (controlData[0] & 128) === 128,
          isMasked: (controlData[1] & 128) === 128,
          isCompressed: (controlData[0] & 64) === 64,
          opCode: controlData[0] & 15,
          dataLength: controlData[1] & 127,
          mask: null,
          data: []
        };

        if (state.opCode === OperationCode.CONTINUATION_FRAME) {
          throw new Error('Continuation frame is not yet supported!');
        }

        if (state.opCode === OperationCode.PONG) {
          throw new Error('Pong frame is not yet supported!');
        }

        if (state.opCode >= 3 && state.opCode <= 7) {
          throw new Error('Reserved for future non-control frames are not supported!');
        }

        if (state.opCode > 10) {
          throw new Error('Reserved for future control frames are not supported!');
        }

        return state;
      }).then(function (state) {
        var dataLengthPromise;
        if (state.dataLength === 126) {
          dataLengthPromise = buffer.get(2).then(function (data) {
            return _utilsEs62['default'].readUInt16(data);
          });
        } else if (state.dataLength == 127) {
          dataLengthPromise = buffer.get(4).then(function (data) {
            return _utilsEs62['default'].readUInt32(data);
          });
        } else {
          dataLengthPromise = Promise.resolve(state.dataLength);
        }

        return dataLengthPromise.then(function (dataLength) {
          state.dataLength = dataLength;
          return state;
        });
      }).then(function (state) {
        if (state.isMasked) {
          return buffer.get(4).then(function (mask) {
            state.mask = mask;
            return state;
          });
        }
        return state;
      }).then(function (state) {
        return state.dataLength ? buffer.get(state.dataLength).then(function (data) {
          state.data = _utilsEs62['default'].mask(state.mask, data);
          return state;
        }) : state;
      }).then(function (state) {
        var dataFrame;
        if (state.opCode === OperationCode.CONNECTION_CLOSE) {
          var code = 0;
          var reason = 'Unknown';

          if (state.dataLength > 0) {
            code = _utilsEs62['default'].readUInt16(state.data);
            if (state.dataLength > 2) {
              reason = _utilsEs62['default'].arrayToString(state.data.subarray(2));
            }
          }

          console.log('Socket is closed: %s (code is %s)', reason, code);

          dataFrame = createMessageFrame(OperationCode.CONNECTION_CLOSE, state.data, true /* isCompleted */
          );
          _this[privates.tcpSocket].send(dataFrame.buffer, 0, dataFrame.length);
          _this[privates.onTCPSocketClose]();
        } else if (state.opCode === OperationCode.TEXT_FRAME || state.opCode === OperationCode.BINARY_FRAME) {
          _this.emit('message', state.data);
        } else if (state.opCode === OperationCode.PING) {
          console.log('PING frame is received (masked: %s, hasData: %s)', state.isMasked, !!state.data);

          if (!state.isCompleted) {
            throw new Error('Fragmented Ping frame is not supported!');
          }

          if (state.dataLength > 125) {
            throw new Error('Ping frame can not have more than 125 bytes of data!');
          }

          dataFrame = createMessageFrame(OperationCode.PONG, state.data, true, /* isCompleted */state.isMasked);
          _this[privates.tcpSocket].send(dataFrame.buffer, 0, dataFrame.length);
        }

        if (!buffer.isEmpty()) {
          _this[privates.onMessageFrame]();
        }
      })['catch'](function (e) {
        var code = 1002;
        var reason = e.message || e.name || 'Unknown failure on server';

        console.log('Socket is closed: %s (code is %s)', reason, code);

        // 2 bytes for the code and the rest for the reason.
        var data = new Uint8Array(2 + reason.length);
        _utilsEs62['default'].writeUInt16(data, code, 0);
        data.set(_utilsEs62['default'].stringToArray(reason), 2);

        var dataFrame = createMessageFrame(OperationCode.CONNECTION_CLOSE, data, true /* isCompleted */
        );
        _this[privates.tcpSocket].send(dataFrame.buffer, 0, dataFrame.length);
        _this[privates.onTCPSocketClose]();
      });
    }
  }, {
    key: privates.onTCPSocketClose,
    value: function () {
      var tcpSocket = this[privates.tcpSocket];

      if (!tcpSocket) {
        return;
      }

      this[privates.clients]['delete'](tcpSocket.host);

      tcpSocket.ondata = tcpSocket.onerror = tcpSocket.onclose = null;

      this[privates.tcpSocket] = null;
    }
  }, {
    key: privates.onTCPServerSocketClose,
    value: function () {
      var tcpServerSocket = this[privates.tcpServerSocket];

      if (!tcpServerSocket) {
        return;
      }

      tcpServerSocket.onconnect = tcpServerSocket.onerror = null;

      this[privates.tcpServerSocket] = null;

      this.emit('stop');
    }
  }]);

  return WebSocketServer;
})();

exports['default'] = {
  Server: WebSocketServer,
  Utils: _utilsEs62['default'],
  FrameBuffer: _frameBufferEs62['default']
};
module.exports = exports['default'];

},{"./frame-buffer.es6":3,"./utils.es6":4,"EventDispatcher":2}],2:[function(require,module,exports){
/*global Map, Set */

'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
function ensureValidEventName(eventName) {
  if (!eventName || typeof eventName !== 'string') {
    throw new Error('Event name should be a valid non-empty string!');
  }
}

function ensureValidHandler(handler) {
  if (typeof handler !== 'function') {
    throw new Error('Handler should be a function!');
  }
}

function ensureAllowedEventName(allowedEvents, eventName) {
  if (allowedEvents && allowedEvents.indexOf(eventName) < 0) {
    throw new Error('Event "' + eventName + '" is not allowed!');
  }
}

// Implements publish/subscribe behaviour that can be applied to any object,
// so that object can be listened for custom events. "this" context is the
// object with Map "listeners" property used to store handlers.
var eventDispatcher = {
  /**
   * Registers listener function to be executed once event occurs.
   * @param {string} eventName Name of the event to listen for.
   * @param {function} handler Handler to be executed once event occurs.
   */
  on: function on(eventName, handler) {
    ensureValidEventName(eventName);
    ensureAllowedEventName(this.allowedEvents, eventName);
    ensureValidHandler(handler);

    var handlers = this.listeners.get(eventName);

    if (!handlers) {
      handlers = new Set();
      this.listeners.set(eventName, handlers);
    }

    // Set.add ignores handler if it has been already registered
    handlers.add(handler);
  },

  /**
   * Removes registered listener for the specified event.
   * @param {string} eventName Name of the event to remove listener for.
   * @param {function} handler Handler to remove, so it won't be executed
   * next time event occurs.
   */
  off: function off(eventName, handler) {
    ensureValidEventName(eventName);
    ensureAllowedEventName(this.allowedEvents, eventName);
    ensureValidHandler(handler);

    var handlers = this.listeners.get(eventName);

    if (!handlers) {
      return;
    }

    handlers['delete'](handler);

    if (!handlers.size) {
      this.listeners['delete'](eventName);
    }
  },

  /**
   * Removes all registered listeners for the specified event.
   * @param {string} eventName Name of the event to remove all listeners for.
   */
  offAll: function offAll(eventName) {
    if (typeof eventName === 'undefined') {
      this.listeners.clear();
      return;
    }

    ensureValidEventName(eventName);
    ensureAllowedEventName(this.allowedEvents, eventName);

    var handlers = this.listeners.get(eventName);

    if (!handlers) {
      return;
    }

    handlers.clear();

    this.listeners['delete'](eventName);
  },

  /**
   * Emits specified event so that all registered handlers will be called
   * with the specified parameters.
   * @param {string} eventName Name of the event to call handlers for.
   * @param {Object} parameters Optional parameters that will be passed to
   * every registered handler.
   */
  emit: function emit(eventName, parameters) {
    ensureValidEventName(eventName);
    ensureAllowedEventName(this.allowedEvents, eventName);

    var handlers = this.listeners.get(eventName);

    if (!handlers) {
      return;
    }

    handlers.forEach(function (handler) {
      try {
        handler(parameters);
      } catch (e) {
        console.error(e);
      }
    });
  }
};

exports['default'] = {
  /**
   * Mixes dispatcher methods into target object.
   * @param {Object} target Object to mix dispatcher methods into.
   * @param {Array.<string>} allowedEvents Optional list of the allowed event
   * names that can be emitted and listened for.
   * @returns {Object} Target object with added dispatcher methods.
   */
  mixin: function mixin(target, allowedEvents) {
    if (!target || typeof target !== 'object') {
      throw new Error('Object to mix into should be valid object!');
    }

    if (typeof allowedEvents !== 'undefined' && !Array.isArray(allowedEvents)) {
      throw new Error('Allowed events should be a valid array of strings!');
    }

    Object.keys(eventDispatcher).forEach(function (method) {
      if (typeof target[method] !== 'undefined') {
        throw new Error('Object to mix into already has "' + method + '" property defined!');
      }
      target[method] = eventDispatcher[method].bind(this);
    }, { listeners: new Map(), allowedEvents: allowedEvents });

    return target;
  }
};
module.exports = exports['default'];

},{}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _EventDispatcher = require('EventDispatcher');

var _EventDispatcher2 = _interopRequireDefault(_EventDispatcher);

var privates = {
  data: Symbol('data'),
  pendingDataRequest: Symbol('pendingDataRequest'),
  splice: Symbol('splice')
};

var WebSocketFrameBuffer = (function () {
  function WebSocketFrameBuffer() {
    _classCallCheck(this, WebSocketFrameBuffer);

    _EventDispatcher2['default'].mixin(this, ['frame', 'data']);

    this[privates.data] = new Uint8Array(0);
    this[privates.pendingDataRequest] = null;
    this[privates.splice] = function (length) {
      var data = this[privates.data];

      var splicedData = data.subarray(0, length);
      this[privates.data] = data.subarray(length, data.length);

      return splicedData;
    };
  }

  _createClass(WebSocketFrameBuffer, [{
    key: 'put',
    value: function put(dataToPut) {
      var data = this[privates.data];

      var newData = new Uint8Array(data.length + dataToPut.length);
      newData.set(data);
      newData.set(dataToPut, data.length);
      this[privates.data] = newData;

      this.emit('data');

      // If no one waiting for data, let's signal that we have new frame!
      if (!this[privates.pendingDataRequest]) {
        this.emit('frame');
      }
    }
  }, {
    key: 'get',
    value: function get(dataLength) {
      var _this = this;

      if (this[privates.pendingDataRequest]) {
        throw new Error('Concurrent read is not allowed.');
      }

      this[privates.pendingDataRequest] = new Promise(function (resolve) {
        var data = _this[privates.data];
        if (data.length >= dataLength) {
          return resolve(_this[privates.splice](dataLength));
        }

        var self = _this;
        _this.on('data', function onData() {
          if (data.length < dataLength) {
            return;
          }

          self.off('data', onData);
          resolve(this[privates.splice](dataLength));
        });
      });

      return this[privates.pendingDataRequest].then(function (data) {
        _this[privates.pendingDataRequest] = null;
        return data;
      });
    }
  }, {
    key: 'isEmpty',
    value: function isEmpty() {
      return this[privates.data].length === 0;
    }
  }]);

  return WebSocketFrameBuffer;
})();

exports['default'] = WebSocketFrameBuffer;
module.exports = exports['default'];

},{"EventDispatcher":2}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
var WebSocketUtils = {
  /**
   * Mask every data element with the mask (WebSocket specific algorithm).
   * @param {Array} mask Mask array.
   * @param {Array} array Data array to mask.
   * @returns {Array} Masked data array.
   */
  mask: function mask(_mask, array) {
    if (_mask) {
      for (var i = 0; i < array.length; i++) {
        array[i] = array[i] ^ _mask[i % 4];
      }
    }
    return array;
  },

  /**
   * Generates 4-item array, every item of which is element of byte mask.
   * @returns {Uint8Array}
   */
  generateRandomMask: function generateRandomMask() {
    var random = new Uint8Array(4);

    window.crypto.getRandomValues(random);

    return random;
  },

  /**
   * Converts string to Uint8Array.
   * @param {string} stringValue String value to convert.
   * @returns {Uint8Array}
   */
  stringToArray: function stringToArray(stringValue) {
    if (typeof stringValue !== 'string') {
      throw new Error('stringValue should be valid string!');
    }

    var array = new Uint8Array(stringValue.length);
    for (var i = 0; i < stringValue.length; i++) {
      array[i] = stringValue.charCodeAt(i);
    }

    return array;
  },

  /**
   * Converts array to string. Every array element is considered as char code.
   * @param {Uint8Array} array Array with the char codes.
   * @returns {string}
   */
  arrayToString: function arrayToString(array) {
    return String.fromCharCode.apply(null, array);
  },

  /**
   * Reads unsigned 16 bit value from two consequent 8-bit array elements.
   * @param {Uint8Array} array Array to read from.
   * @param {Number} offset Index to start read value.
   * @returns {Number}
   */
  readUInt16: function readUInt16(array, offset) {
    offset = offset || 0;
    return (array[offset] << 8) + array[offset + 1];
  },

  /**
   * Reads unsigned 32 bit value from four consequent 8-bit array elements.
   * @param {Uint8Array} array Array to read from.
   * @param {Number} offset Index to start read value.
   * @returns {Number}
   */
  readUInt32: function readUInt32(array, offset) {
    offset = offset || 0;
    return (array[offset] << 24) + (array[offset + 1] << 16) + (array[offset + 2] << 8) + array[offset + 3];
  },

  /**
   * Writes unsigned 16 bit value to two consequent 8-bit array elements.
   * @param {Uint8Array} array Array to write to.
   * @param {Number} value 16 bit unsigned value to write into array.
   * @param {Number} offset Index to start write value.
   * @returns {Number}
   */
  writeUInt16: function writeUInt16(array, value, offset) {
    array[offset] = (value & 65280) >> 8;
    array[offset + 1] = value & 255;
  },

  /**
   * Writes unsigned 16 bit value to two consequent 8-bit array elements.
   * @param {Uint8Array} array Array to write to.
   * @param {Number} value 16 bit unsigned value to write into array.
   * @param {Number} offset Index to start write value.
   * @returns {Number}
   */
  writeUInt32: function writeUInt32(array, value, offset) {
    array[offset] = (value & 4278190080) >> 24;
    array[offset + 1] = (value & 16711680) >> 16;
    array[offset + 2] = (value & 65280) >> 8;
    array[offset + 3] = value & 255;
  }
};

exports['default'] = WebSocketUtils;
module.exports = exports['default'];

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvbWVkaWEvYXphc3lwa2luL3Byb2plY3RzL2dpdGh1Yi9meG9zLXdlYnNvY2tldC1zZXJ2ZXIvc3JjL3NlcnZlci5lczYuanMiLCIvbWVkaWEvYXphc3lwa2luL3Byb2plY3RzL2dpdGh1Yi9meG9zLXdlYnNvY2tldC1zZXJ2ZXIvY29tcG9uZW50cy9ldmVudC1kaXNwYXRjaGVyLWpzL2V2ZW50LWRpc3BhdGNoZXIuZXM2LmpzIiwiL21lZGlhL2F6YXN5cGtpbi9wcm9qZWN0cy9naXRodWIvZnhvcy13ZWJzb2NrZXQtc2VydmVyL3NyYy9mcmFtZS1idWZmZXIuZXM2LmpzIiwiL21lZGlhL2F6YXN5cGtpbi9wcm9qZWN0cy9naXRodWIvZnhvcy13ZWJzb2NrZXQtc2VydmVyL3NyYy91dGlscy5lczYuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7K0JDQTRCLGlCQUFpQjs7Ozs4QkFDWixvQkFBb0I7Ozs7d0JBQzFCLGFBQWE7Ozs7Ozs7O0FBTXhDLElBQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQzs7Ozs7OztBQU9wQixJQUFNLGtCQUFrQixHQUFHLHNDQUFzQyxDQUFDOzs7Ozs7O0FBT2xFLElBQU0sNEJBQTRCLEdBQ2hDLGtDQUFrQyxHQUFHLElBQUksR0FDekMscUJBQXFCLEdBQUcsSUFBSSxHQUM1QixvQkFBb0IsR0FBRyxJQUFJLEdBQzNCLHdDQUF3QyxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7Ozs7OztBQU16RCxJQUFNLGFBQWEsR0FBRztBQUNwQixvQkFBa0IsRUFBRSxDQUFDO0FBQ3JCLFlBQVUsRUFBRSxDQUFDO0FBQ2IsY0FBWSxFQUFFLENBQUM7QUFDZixrQkFBZ0IsRUFBRSxDQUFDO0FBQ25CLE1BQUksRUFBRSxDQUFDO0FBQ1AsTUFBSSxFQUFFLEVBQUU7Q0FDVCxDQUFDOzs7Ozs7O0FBT0Ys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QWMiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiaW1wb3J0IEV2ZW50RGlzcGF0Y2hlciBmcm9tICdFdmVudERpc3BhdGNoZXInO1xuaW1wb3J0IFdlYlNvY2tldEZyYW1lQnVmZmVyIGZyb20gJy4vZnJhbWUtYnVmZmVyLmVzNic7XG5pbXBvcnQgV2ViU29ja2V0VXRpbHMgZnJvbSAnLi91dGlscy5lczYnO1xuXG4vKipcbiAqIFNlcXVlbmNlIHVzZWQgdG8gc2VwYXJhdGUgSFRUUCByZXF1ZXN0IGhlYWRlcnMgYW5kIGJvZHkuXG4gKiBAY29uc3Qge3N0cmluZ31cbiAqL1xuY29uc3QgQ1JMRiA9ICdcXHJcXG4nO1xuXG4vKipcbiAqIE1hZ2ljIEdVSUQgZGVmaW5lZCBieSBSRkMgdG8gY29uY2F0ZW5hdGUgd2l0aCB3ZWIgc29ja2V0IGtleSBkdXJpbmdcbiAqIHdlYnNvY2tldCBoYW5kc2hha2UuXG4gKiBAY29uc3Qge3N0cmluZ31cbiAqL1xuY29uc3QgV0VCU09DS0VUX0tFWV9HVUlEID0gJzI1OEVBRkE1LUU5MTQtNDdEQS05NUNBLUM1QUIwREM4NUIxMSc7XG5cbi8qKlxuICogV2Vic29ja2V0IGhhbmRzaGFrZSByZXNwb25zZSB0ZW1wbGF0ZSBzdHJpbmcsIHt3ZWItc29ja2V0LWtleX0gc2hvdWxkIGJlXG4gKiByZXBsYWNlZCB3aXRoIHRoZSBhcHByb3ByaWF0ZSBrZXkuXG4gKiBAY29uc3Qge3N0cmluZ31cbiAqL1xuY29uc3QgV0VCU09DS0VUX0hBTkRTSEFLRV9SRVNQT05TRSA9XG4gICdIVFRQLzEuMSAxMDEgU3dpdGNoaW5nIFByb3RvY29scycgKyBDUkxGICtcbiAgJ0Nvbm5lY3Rpb246IFVwZ3JhZGUnICsgQ1JMRiArXG4gICdVcGdyYWRlOiB3ZWJzb2NrZXQnICsgQ1JMRiArXG4gICdTZWMtV2ViU29ja2V0LUFjY2VwdDoge3dlYi1zb2NrZXQta2V5fScgKyBDUkxGICsgQ1JMRjtcblxuLyoqXG4gKiBFbnVtZXJhdGlvbiBvZiBhbGwgcG9zc2libGUgb3BlcmF0aW9uIGNvZGVzLlxuICogQGVudW0ge251bWJlcn1cbiAqL1xuY29uc3QgT3BlcmF0aW9uQ29kZSA9IHtcbiAgQ09OVElOVUFUSU9OX0ZSQU1FOiAwLFxuICBURVhUX0ZSQU1FOiAxLFxuICBCSU5BUllfRlJBTUU6IDIsXG4gIENPTk5FQ1RJT05fQ0xPU0U6IDgsXG4gIFBJTkc6IDksXG4gIFBPTkc6IDEwXG59O1xuXG4vKipcbiAqIEV4dHJhY3RzIEhUVFAgaGVhZGVyIG1hcCBmcm9tIEhUVFAgaGVhZGVyIHN0cmluZy5cbiAqIEBwYXJhbSB7c3RyaW5nfSBodHRwSGVhZGVyU3RyaW5nIEhUVFAgaGVhZGVyIHN0cmluZy5cbiAqIEByZXR1cm5zIHtNYXAuPHN0cmluZywgc3RyaW5nPn0gSFRUUCBoZWFkZXIga2V5LXZhbHVlIG1hcC5cbiAqL1xuZnVuY3Rpb24gZ2V0SHR0cEhlYWRlcnMoaHR0cEhlYWRlclN0cmluZykge1xuICB2YXIgaHR0cEhlYWRlcnMgPSBodHRwSGVhZGVyU3RyaW5nLnRyaW0oKS5zcGxpdChDUkxGKTtcbiAgcmV0dXJuIG5ldyBNYXAoaHR0cEhlYWRlcnMubWFwKChodHRwSGVhZGVyKSA9PiB7XG4gICAgcmV0dXJuIGh0dHBIZWFkZXIuc3BsaXQoJzonKS5tYXAoKGVudGl0eSkgPT4gZW50aXR5LnRyaW0oKSk7XG4gIH0pKTtcbn1cblxuLyoqXG4gKiBQZXJmb3JtcyBXZWJTb2NrZXQgSFRUUCBIYW5kc2hha2UuXG4gKiBAcGFyYW0ge1RDUFNvY2tldH0gdGNwU29ja2V0IENvbm5lY3Rpb24gc29ja2V0LlxuICogQHBhcmFtIHtVaW50OEFycmF5fSBodHRwUmVxdWVzdERhdGEgSFRUUCBIYW5kc2hha2UgZGF0YSBhcnJheS5cbiAqIEByZXR1cm5zIHtNYXAuPHN0cmluZywgc3RyaW5nPn0gUGFyc2VkIGh0dHAgaGVhZGVyc1xuICovXG5mdW5jdGlvbiBwZXJmb3JtSGFuZHNoYWtlKHRjcFNvY2tldCwgaHR0cFJlcXVlc3REYXRhKSB7XG4gIHZhciBodHRwSGVhZGVycyA9IGdldEh0dHBIZWFkZXJzKFxuICAgIFdlYlNvY2tldFV0aWxzLmFycmF5VG9TdHJpbmcoaHR0cFJlcXVlc3REYXRhKS5zcGxpdChDUkxGICsgQ1JMRilbMF1cbiAgKTtcblxuICB2YXIga2V5ID0gV2ViU29ja2V0VXRpbHMuc3RyaW5nVG9BcnJheShcbiAgICBodHRwSGVhZGVycy5nZXQoJ1NlYy1XZWJTb2NrZXQtS2V5JykgKyBXRUJTT0NLRVRfS0VZX0dVSURcbiAgKTtcblxuICB2YXIgc3VidGxlID0gd2luZG93LmNyeXB0by5zdWJ0bGU7XG4gIHJldHVybiBzdWJ0bGUuZGlnZXN0KHsgbmFtZTogJ1NIQS0xJyB9LCBrZXkpLnRoZW4oKGhhc2hBcnJheUJ1ZmZlcikgPT4ge1xuICAgIHZhciB3ZWJTb2NrZXRLZXkgPSBidG9hKFdlYlNvY2tldFV0aWxzLmFycmF5VG9TdHJpbmcoXG4gICAgICBuZXcgVWludDhBcnJheShoYXNoQXJyYXlCdWZmZXIpXG4gICAgKSk7XG4gICAgdmFyIGFycmF5UmVzcG9uc2UgPSBXZWJTb2NrZXRVdGlscy5zdHJpbmdUb0FycmF5KFxuICAgICAgV0VCU09DS0VUX0hBTkRTSEFLRV9SRVNQT05TRS5yZXBsYWNlKCd7d2ViLXNvY2tldC1rZXl9Jywgd2ViU29ja2V0S2V5KVxuICAgICk7XG5cbiAgICB0Y3BTb2NrZXQuc2VuZChhcnJheVJlc3BvbnNlLmJ1ZmZlciwgMCwgYXJyYXlSZXNwb25zZS5ieXRlTGVuZ3RoKTtcblxuICAgIHJldHVybiBodHRwSGVhZGVycztcbiAgfSk7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBvdXRnb2luZyB3ZWJzb2NrZXQgbWVzc2FnZSBmcmFtZS5cbiAqIEBwYXJhbSB7TnVtYmVyfSBvcENvZGUgRnJhbWUgb3BlcmF0aW9uIGNvZGUuXG4gKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGRhdGEgRGF0YSBhcnJheS5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gaXNDb21wbGV0ZSBJbmRpY2F0ZXMgaWYgZnJhbWUgaXMgY29tcGxldGVkLlxuICogQHBhcmFtIHtCb29sZWFuP30gaXNNYXNrZWQgSW5kaWNhdGVzIGlmIGZyYW1lIGRhdGEgc2hvdWxkIGJlIG1hc2tlZC5cbiAqIEByZXR1cm5zIHtVaW50OEFycmF5fSBDb25zdHJ1Y3RlZCBmcmFtZSBkYXRhLlxuICovXG5mdW5jdGlvbiBjcmVhdGVNZXNzYWdlRnJhbWUob3BDb2RlLCBkYXRhLCBpc0NvbXBsZXRlLCBpc01hc2tlZCkge1xuICB2YXIgZGF0YUxlbmd0aCA9IChkYXRhICYmIGRhdGEubGVuZ3RoKSB8fCAwO1xuICB2YXIgZGF0YU9mZnNldCA9IGlzTWFza2VkID8gNiA6IDI7XG5cbiAgdmFyIHNlY29uZEJ5dGUgPSAwO1xuICBpZiAoZGF0YUxlbmd0aCA+PSA2NTUzNikge1xuICAgIGRhdGFPZmZzZXQgKz0gODtcbiAgICBzZWNvbmRCeXRlID0gMTI3O1xuICB9IGVsc2UgaWYgKGRhdGFMZW5ndGggPiAxMjUpIHtcbiAgICBkYXRhT2Zmc2V0ICs9IDI7XG4gICAgc2Vjb25kQnl0ZSA9IDEyNjtcbiAgfSBlbHNlIHtcbiAgICBzZWNvbmRCeXRlID0gZGF0YUxlbmd0aDtcbiAgfVxuXG4gIHZhciBvdXRwdXRCdWZmZXIgPSBuZXcgVWludDhBcnJheShkYXRhT2Zmc2V0ICsgZGF0YUxlbmd0aCk7XG5cbiAgLy8gV3JpdGluZyBPUENPREUsIEZJTiBhbmQgTEVOR1RIXG4gIG91dHB1dEJ1ZmZlclswXSA9IGlzQ29tcGxldGUgPyBvcENvZGUgfCAweDgwIDogb3BDb2RlO1xuICBvdXRwdXRCdWZmZXJbMV0gPSBpc01hc2tlZCA/IHNlY29uZEJ5dGUgfCAweDgwIDogc2Vjb25kQnl0ZTtcblxuICAvLyBXcml0aW5nIERBVEEgTEVOR1RIXG4gIHN3aXRjaCAoc2Vjb25kQnl0ZSkge1xuICAgIGNhc2UgMTI2OlxuICAgICAgV2ViU29ja2V0VXRpbHMud3JpdGVVSW50MTYob3V0cHV0QnVmZmVyLCBkYXRhTGVuZ3RoLCAyKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgMTI3OlxuICAgICAgV2ViU29ja2V0VXRpbHMud3JpdGVVSW50MzIob3V0cHV0QnVmZmVyLCAwLCAyKTtcbiAgICAgIFdlYlNvY2tldFV0aWxzLndyaXRlVUludDMyKG91dHB1dEJ1ZmZlciwgZGF0YUxlbmd0aCwgNik7XG4gICAgICBicmVhaztcbiAgfVxuXG4gIGlmIChpc01hc2tlZCAmJiBkYXRhTGVuZ3RoKSB7XG4gICAgdmFyIG1hc2sgPSBXZWJTb2NrZXRVdGlscy5nZW5lcmF0ZVJhbmRvbU1hc2soKTtcblxuICAgIC8vIFdyaXRpbmcgTUFTS1xuICAgIG91dHB1dEJ1ZmZlci5zZXQobWFzaywgZGF0YU9mZnNldCAtIDQpO1xuXG4gICAgV2ViU29ja2V0VXRpbHMubWFzayhtYXNrLCBkYXRhKTtcbiAgfVxuXG4gIGZvcih2YXIgaSA9IDA7IGkgPCBkYXRhTGVuZ3RoOyBpKyspIHtcbiAgICBvdXRwdXRCdWZmZXJbZGF0YU9mZnNldCArIGldID0gZGF0YVtpXTtcbiAgfVxuXG4gIHJldHVybiBvdXRwdXRCdWZmZXI7XG59XG5cbnZhciBwcml2YXRlcyA9IHtcbiAgdGNwU2VydmVyU29ja2V0OiBTeW1ib2woJ3RjcC1zb2NrZXQnKSxcbiAgb25UQ1BTZXJ2ZXJTb2NrZXRDb25uZWN0OiBTeW1ib2woJ29uVENQU2VydmVyU29ja2V0Q29ubmVjdCcpLFxuICBvblRDUFNlcnZlclNvY2tldENsb3NlOiBTeW1ib2woJ29uVENQU2VydmVyU29ja2V0Q2xvc2UnKSxcblxuICB0Y3BTb2NrZXQ6IFN5bWJvbCgndGNwU29ja2V0JyksXG4gIG9uVENQU29ja2V0RGF0YTogU3ltYm9sKCdvblRDUFNvY2tldERhdGEnKSxcbiAgb25UQ1BTb2NrZXRDbG9zZTogU3ltYm9sKCdvblRDUFNvY2tldENsb3NlJyksXG5cbiAgY2xpZW50czogU3ltYm9sKCdjbGllbnRzJyksXG4gIGZyYW1lQnVmZmVyOiBTeW1ib2woJ2ZyYW1lQnVmZmVyJyksXG5cbiAgb25NZXNzYWdlRnJhbWU6IFN5bWJvbCgnb25NZXNzYWdlRnJhbWUnKVxufTtcblxuLyoqXG4gKiBXZWJTb2NrZXRTZXJ2ZXIgY29uc3RydWN0b3IgdGhhdCBhY2NlcHRzIHBvcnQgdG8gbGlzdGVuIG9uLlxuICogQHBhcmFtIHtOdW1iZXJ9IHBvcnQgTnVtYmVyIHRvIGxpc3RlbiBmb3Igd2Vic29ja2V0IGNvbm5lY3Rpb25zLlxuICovXG5jbGFzcyBXZWJTb2NrZXRTZXJ2ZXIge1xuICBjb25zdHJ1Y3Rvcihwb3J0KSB7XG4gICAgRXZlbnREaXNwYXRjaGVyLm1peGluKHRoaXMsIFsnbWVzc2FnZScsICdzdG9wJ10pO1xuXG4gICAgdmFyIHRjcFNlcnZlclNvY2tldCA9IG5hdmlnYXRvci5tb3pUQ1BTb2NrZXQubGlzdGVuKHBvcnQsIHtcbiAgICAgIGJpbmFyeVR5cGU6ICdhcnJheWJ1ZmZlcidcbiAgICB9KTtcblxuICAgIHRoaXNbcHJpdmF0ZXMudGNwU2VydmVyU29ja2V0XSA9IHRjcFNlcnZlclNvY2tldDtcbiAgICB0aGlzW3ByaXZhdGVzLmNsaWVudHNdID0gbmV3IE1hcCgpO1xuICAgIHRoaXNbcHJpdmF0ZXMuZnJhbWVCdWZmZXJdID0gbmV3IFdlYlNvY2tldEZyYW1lQnVmZmVyKCk7XG5cbiAgICB0aGlzW3ByaXZhdGVzLm9uTWVzc2FnZUZyYW1lXSA9IHRoaXNbcHJpdmF0ZXMub25NZXNzYWdlRnJhbWVdLmJpbmQodGhpcyk7XG5cbiAgICB0Y3BTZXJ2ZXJTb2NrZXQub25jb25uZWN0ID1cbiAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTZXJ2ZXJTb2NrZXRDb25uZWN0XS5iaW5kKHRoaXMpO1xuICAgIHRjcFNlcnZlclNvY2tldC5vbmVycm9yID0gdGhpc1twcml2YXRlcy5vblRDUFNlcnZlclNvY2tldENsb3NlXS5iaW5kKHRoaXMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgZGF0YSB0byB0aGUgY29ubmVjdGVkIGNsaWVudFxuICAgKiBAcGFyYW0ge0FycmF5QnVmZmVyfEFycmF5fHN0cmluZ30gZGF0YSBEYXRhIHRvIHNlbmQuXG4gICAqL1xuICBzZW5kKGRhdGEpIHtcbiAgICBpZiAoIUFycmF5QnVmZmVyLmlzVmlldyhkYXRhKSAmJiAhKGRhdGEgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikpIHtcbiAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZGF0YSA9IG5ldyBVaW50OEFycmF5KFdlYlNvY2tldFV0aWxzLnN0cmluZ1RvQXJyYXkoZGF0YSkpO1xuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgIGRhdGEgPSBuZXcgVWludDhBcnJheShkYXRhKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgZGF0YSB0eXBlOiAnICsgdHlwZW9mIGRhdGEpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBkYXRhRnJhbWUgPSBjcmVhdGVNZXNzYWdlRnJhbWUoXG4gICAgICBPcGVyYXRpb25Db2RlLkJJTkFSWV9GUkFNRSxcbiAgICAgIGRhdGEsXG4gICAgICB0cnVlIC8qIGlzQ29tcGxldGVkICovLFxuICAgICAgZmFsc2UgLyogaXNNYXNrZWQgKi9cbiAgICApO1xuXG4gICAgdGhpc1twcml2YXRlcy50Y3BTb2NrZXRdLnNlbmQoZGF0YUZyYW1lLmJ1ZmZlciwgMCwgZGF0YUZyYW1lLmxlbmd0aCk7XG4gIH1cblxuICAvKipcbiAgICogRGVzdHJveXMgc29ja2V0IGNvbm5lY3Rpb24uXG4gICAqL1xuICBzdG9wKCkge1xuICAgIHZhciB0Y3BTb2NrZXQgPSB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF07XG4gICAgaWYgKHRjcFNvY2tldCkge1xuICAgICAgdGNwU29ja2V0LmNsb3NlKCk7XG4gICAgICB0aGlzW3ByaXZhdGVzLm9uVENQU29ja2V0Q2xvc2VdKCk7XG4gICAgfVxuXG4gICAgdmFyIHRjcFNlcnZlclNvY2tldCA9IHRoaXNbcHJpdmF0ZXMudGNwU2VydmVyU29ja2V0XTtcbiAgICBpZiAodGNwU2VydmVyU29ja2V0KSB7XG4gICAgICB0Y3BTZXJ2ZXJTb2NrZXQuY2xvc2UoKTtcbiAgICAgIHRoaXNbcHJpdmF0ZXMub25UQ1BTZXJ2ZXJTb2NrZXRDbG9zZV0oKTtcbiAgICB9XG5cbiAgICB0aGlzW3ByaXZhdGVzLmNsaWVudHNdLmNsZWFyKCk7XG4gIH1cblxuICBbcHJpdmF0ZXMub25UQ1BTZXJ2ZXJTb2NrZXRDb25uZWN0XSh0Y3BTb2NrZXQpIHtcbiAgICB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF0gPSB0Y3BTb2NrZXQ7XG5cbiAgICB0aGlzW3ByaXZhdGVzLmZyYW1lQnVmZmVyXS5vbignZnJhbWUnLCB0aGlzW3ByaXZhdGVzLm9uTWVzc2FnZUZyYW1lXSk7XG5cbiAgICB0Y3BTb2NrZXQub25kYXRhID0gdGhpc1twcml2YXRlcy5vblRDUFNvY2tldERhdGFdLmJpbmQodGhpcyk7XG4gICAgdGNwU29ja2V0Lm9uY2xvc2UgPSB0Y3BTb2NrZXQub25lcnJvciA9XG4gICAgICB0aGlzW3ByaXZhdGVzLm9uVENQU29ja2V0Q2xvc2VdLmJpbmQodGhpcyk7XG4gIH1cblxuICAvKipcbiAgICogTW96VGNwU29ja2V0IGRhdGEgaGFuZGxlci5cbiAgICogQHBhcmFtIHtUQ1BTb2NrZXRFdmVudH0gc29ja2V0RXZlbnQgVENQU29ja2V0IGRhdGEgZXZlbnQuXG4gICAqL1xuICBbcHJpdmF0ZXMub25UQ1BTb2NrZXREYXRhXShzb2NrZXRFdmVudCkge1xuICAgIHZhciBjbGllbnRzID0gdGhpc1twcml2YXRlcy5jbGllbnRzXTtcbiAgICB2YXIgdGNwU29ja2V0ID0gdGhpc1twcml2YXRlcy50Y3BTb2NrZXRdO1xuXG4gICAgdmFyIGZyYW1lRGF0YSA9IG5ldyBVaW50OEFycmF5KHNvY2tldEV2ZW50LmRhdGEpO1xuXG4gICAgLy8gSWYgd2UgZG9uJ3QgaGF2ZSBjb25uZWN0aW9uIGluZm8gZnJvbSB0aGlzIGhvc3QgbGV0J3MgcGVyZm9ybSBoYW5kc2hha2VcbiAgICAvLyBDdXJyZW50bHkgd2Ugc3VwcG9ydCBvbmx5IE9ORSBjbGllbnQgZnJvbSBob3N0LlxuICAgIGlmICghY2xpZW50cy5oYXModGNwU29ja2V0Lmhvc3QpKSB7XG4gICAgICBwZXJmb3JtSGFuZHNoYWtlKHRjcFNvY2tldCwgZnJhbWVEYXRhKS50aGVuKChoYW5kc2hha2VSZXN1bHQpID0+IHtcbiAgICAgICAgaWYgKGhhbmRzaGFrZVJlc3VsdCkge1xuICAgICAgICAgIGNsaWVudHMuc2V0KHRjcFNvY2tldC5ob3N0LCBoYW5kc2hha2VSZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzW3ByaXZhdGVzLmZyYW1lQnVmZmVyXS5wdXQoZnJhbWVEYXRhKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIFdlYlNvY2tldCBpbmNvbWluZyBmcmFtZS5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBmcmFtZSBNZXNzYWdlIGZyYW1lIGRhdGEgaW4gdmlldyBvZiBVaW50OEFycmF5LlxuICAgKi9cbiAgW3ByaXZhdGVzLm9uTWVzc2FnZUZyYW1lXShmcmFtZSkge1xuICAgIHZhciBidWZmZXIgPSB0aGlzW3ByaXZhdGVzLmZyYW1lQnVmZmVyXTtcblxuICAgIGJ1ZmZlci5nZXQoMikudGhlbigoY29udHJvbERhdGEpID0+IHtcbiAgICAgIHZhciBzdGF0ZSA9IHtcbiAgICAgICAgaXNDb21wbGV0ZWQ6IChjb250cm9sRGF0YVswXSAmIDB4ODApID09PSAweDgwLFxuICAgICAgICBpc01hc2tlZDogKGNvbnRyb2xEYXRhWzFdICYgMHg4MCkgPT09IDB4ODAsXG4gICAgICAgIGlzQ29tcHJlc3NlZDogKGNvbnRyb2xEYXRhWzBdICYgMHg0MCkgPT09IDB4NDAsXG4gICAgICAgIG9wQ29kZTogY29udHJvbERhdGFbMF0gJiAweGYsXG4gICAgICAgIGRhdGFMZW5ndGg6IGNvbnRyb2xEYXRhWzFdICYgMHg3ZixcbiAgICAgICAgbWFzazogbnVsbCxcbiAgICAgICAgZGF0YTogW11cbiAgICAgIH07XG5cbiAgICAgIGlmIChzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuQ09OVElOVUFUSU9OX0ZSQU1FKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignQ29udGludWF0aW9uIGZyYW1lIGlzIG5vdCB5ZXQgc3VwcG9ydGVkIScpO1xuICAgICAgfVxuXG4gICAgICBpZiAoc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLlBPTkcpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQb25nIGZyYW1lIGlzIG5vdCB5ZXQgc3VwcG9ydGVkIScpO1xuICAgICAgfVxuXG4gICAgICBpZiAoc3RhdGUub3BDb2RlID49IDMgJiYgc3RhdGUub3BDb2RlIDw9IDcpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICdSZXNlcnZlZCBmb3IgZnV0dXJlIG5vbi1jb250cm9sIGZyYW1lcyBhcmUgbm90IHN1cHBvcnRlZCEnXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGlmIChzdGF0ZS5vcENvZGUgPiAxMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgJ1Jlc2VydmVkIGZvciBmdXR1cmUgY29udHJvbCBmcmFtZXMgYXJlIG5vdCBzdXBwb3J0ZWQhJ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gc3RhdGU7XG4gICAgfSkudGhlbigoc3RhdGUpID0+IHtcbiAgICAgIHZhciBkYXRhTGVuZ3RoUHJvbWlzZTtcbiAgICAgIGlmIChzdGF0ZS5kYXRhTGVuZ3RoID09PSAxMjYpIHtcbiAgICAgICAgZGF0YUxlbmd0aFByb21pc2UgPSBidWZmZXIuZ2V0KDIpLnRoZW4oXG4gICAgICAgICAgKGRhdGEpID0+IFdlYlNvY2tldFV0aWxzLnJlYWRVSW50MTYoZGF0YSlcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUuZGF0YUxlbmd0aCA9PSAxMjcpIHtcbiAgICAgICAgZGF0YUxlbmd0aFByb21pc2UgPSBidWZmZXIuZ2V0KDQpLnRoZW4oXG4gICAgICAgICAgKGRhdGEpID0+IFdlYlNvY2tldFV0aWxzLnJlYWRVSW50MzIoZGF0YSlcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRhdGFMZW5ndGhQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKHN0YXRlLmRhdGFMZW5ndGgpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gZGF0YUxlbmd0aFByb21pc2UudGhlbigoZGF0YUxlbmd0aCkgPT4ge1xuICAgICAgICBzdGF0ZS5kYXRhTGVuZ3RoID0gZGF0YUxlbmd0aDtcbiAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgICAgfSk7XG4gICAgfSkudGhlbigoc3RhdGUpID0+IHtcbiAgICAgIGlmIChzdGF0ZS5pc01hc2tlZCkge1xuICAgICAgICByZXR1cm4gYnVmZmVyLmdldCg0KS50aGVuKChtYXNrKSA9PiB7XG4gICAgICAgICAgc3RhdGUubWFzayA9IG1hc2s7XG4gICAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9KS50aGVuKChzdGF0ZSkgPT4ge1xuICAgICAgcmV0dXJuIHN0YXRlLmRhdGFMZW5ndGggPyBidWZmZXIuZ2V0KHN0YXRlLmRhdGFMZW5ndGgpLnRoZW4oKGRhdGEpID0+IHtcbiAgICAgICAgc3RhdGUuZGF0YSA9IFdlYlNvY2tldFV0aWxzLm1hc2soc3RhdGUubWFzaywgZGF0YSk7XG4gICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICAgIH0pIDogc3RhdGU7XG4gICAgfSkudGhlbigoc3RhdGUpID0+IHtcbiAgICAgIHZhciBkYXRhRnJhbWU7XG4gICAgICBpZiAoc3RhdGUub3BDb2RlID09PSBPcGVyYXRpb25Db2RlLkNPTk5FQ1RJT05fQ0xPU0UpIHtcbiAgICAgICAgdmFyIGNvZGUgPSAwO1xuICAgICAgICB2YXIgcmVhc29uID0gJ1Vua25vd24nO1xuXG4gICAgICAgIGlmIChzdGF0ZS5kYXRhTGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvZGUgPSAgV2ViU29ja2V0VXRpbHMucmVhZFVJbnQxNihzdGF0ZS5kYXRhKTtcbiAgICAgICAgICBpZiAoc3RhdGUuZGF0YUxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgIHJlYXNvbiA9IFdlYlNvY2tldFV0aWxzLmFycmF5VG9TdHJpbmcoc3RhdGUuZGF0YS5zdWJhcnJheSgyKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc29sZS5sb2coJ1NvY2tldCBpcyBjbG9zZWQ6ICVzIChjb2RlIGlzICVzKScsIHJlYXNvbiwgY29kZSk7XG5cbiAgICAgICAgZGF0YUZyYW1lID0gY3JlYXRlTWVzc2FnZUZyYW1lKFxuICAgICAgICAgIE9wZXJhdGlvbkNvZGUuQ09OTkVDVElPTl9DTE9TRSwgc3RhdGUuZGF0YSwgdHJ1ZSAvKiBpc0NvbXBsZXRlZCAqL1xuICAgICAgICApO1xuICAgICAgICB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF0uc2VuZChkYXRhRnJhbWUuYnVmZmVyLCAwLCBkYXRhRnJhbWUubGVuZ3RoKTtcbiAgICAgICAgdGhpc1twcml2YXRlcy5vblRDUFNvY2tldENsb3NlXSgpO1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuVEVYVF9GUkFNRSB8fFxuICAgICAgICAgICAgICAgICBzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuQklOQVJZX0ZSQU1FKSB7XG4gICAgICAgIHRoaXMuZW1pdCgnbWVzc2FnZScsIHN0YXRlLmRhdGEpO1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZS5vcENvZGUgPT09IE9wZXJhdGlvbkNvZGUuUElORykge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAnUElORyBmcmFtZSBpcyByZWNlaXZlZCAobWFza2VkOiAlcywgaGFzRGF0YTogJXMpJyxcbiAgICAgICAgICBzdGF0ZS5pc01hc2tlZCxcbiAgICAgICAgICAhIXN0YXRlLmRhdGFcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoIXN0YXRlLmlzQ29tcGxldGVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGcmFnbWVudGVkIFBpbmcgZnJhbWUgaXMgbm90IHN1cHBvcnRlZCEnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5kYXRhTGVuZ3RoID4gMTI1KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgJ1BpbmcgZnJhbWUgY2FuIG5vdCBoYXZlIG1vcmUgdGhhbiAxMjUgYnl0ZXMgb2YgZGF0YSEnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRhdGFGcmFtZSA9IGNyZWF0ZU1lc3NhZ2VGcmFtZShcbiAgICAgICAgICBPcGVyYXRpb25Db2RlLlBPTkcsIHN0YXRlLmRhdGEsIHRydWUgLyogaXNDb21wbGV0ZWQgKi8sIHN0YXRlLmlzTWFza2VkXG4gICAgICAgICk7XG4gICAgICAgIHRoaXNbcHJpdmF0ZXMudGNwU29ja2V0XS5zZW5kKGRhdGFGcmFtZS5idWZmZXIsIDAsIGRhdGFGcmFtZS5sZW5ndGgpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWJ1ZmZlci5pc0VtcHR5KCkpIHtcbiAgICAgICAgdGhpc1twcml2YXRlcy5vbk1lc3NhZ2VGcmFtZV0oKTtcbiAgICAgIH1cbiAgICB9KS5jYXRjaCgoZSkgPT4ge1xuICAgICAgdmFyIGNvZGUgPSAxMDAyO1xuICAgICAgdmFyIHJlYXNvbiA9IGUubWVzc2FnZSB8fCBlLm5hbWUgfHwgJ1Vua25vd24gZmFpbHVyZSBvbiBzZXJ2ZXInO1xuXG4gICAgICBjb25zb2xlLmxvZygnU29ja2V0IGlzIGNsb3NlZDogJXMgKGNvZGUgaXMgJXMpJywgcmVhc29uLCBjb2RlKTtcblxuICAgICAgLy8gMiBieXRlcyBmb3IgdGhlIGNvZGUgYW5kIHRoZSByZXN0IGZvciB0aGUgcmVhc29uLlxuICAgICAgdmFyIGRhdGEgPSBuZXcgVWludDhBcnJheSgyICsgcmVhc29uLmxlbmd0aCk7XG4gICAgICBXZWJTb2NrZXRVdGlscy53cml0ZVVJbnQxNihkYXRhLCBjb2RlLCAwKTtcbiAgICAgIGRhdGEuc2V0KFdlYlNvY2tldFV0aWxzLnN0cmluZ1RvQXJyYXkocmVhc29uKSwgMik7XG5cbiAgICAgIHZhciBkYXRhRnJhbWUgPSBjcmVhdGVNZXNzYWdlRnJhbWUoXG4gICAgICAgIE9wZXJhdGlvbkNvZGUuQ09OTkVDVElPTl9DTE9TRSwgZGF0YSwgdHJ1ZSAvKiBpc0NvbXBsZXRlZCAqL1xuICAgICAgKTtcbiAgICAgIHRoaXNbcHJpdmF0ZXMudGNwU29ja2V0XS5zZW5kKGRhdGFGcmFtZS5idWZmZXIsIDAsIGRhdGFGcmFtZS5sZW5ndGgpO1xuICAgICAgdGhpc1twcml2YXRlcy5vblRDUFNvY2tldENsb3NlXSgpO1xuICAgIH0pO1xuICB9XG5cbiAgW3ByaXZhdGVzLm9uVENQU29ja2V0Q2xvc2VdKCkge1xuICAgIHZhciB0Y3BTb2NrZXQgPSB0aGlzW3ByaXZhdGVzLnRjcFNvY2tldF07XG5cbiAgICBpZiAoIXRjcFNvY2tldCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXNbcHJpdmF0ZXMuY2xpZW50c10uZGVsZXRlKHRjcFNvY2tldC5ob3N0KTtcblxuICAgIHRjcFNvY2tldC5vbmRhdGEgPSB0Y3BTb2NrZXQub25lcnJvciA9IHRjcFNvY2tldC5vbmNsb3NlID0gbnVsbDtcblxuICAgIHRoaXNbcHJpdmF0ZXMudGNwU29ja2V0XSA9IG51bGw7XG4gIH1cblxuICBbcHJpdmF0ZXMub25UQ1BTZXJ2ZXJTb2NrZXRDbG9zZV0oKSB7XG4gICAgdmFyIHRjcFNlcnZlclNvY2tldCA9IHRoaXNbcHJpdmF0ZXMudGNwU2VydmVyU29ja2V0XTtcblxuICAgIGlmICghdGNwU2VydmVyU29ja2V0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGNwU2VydmVyU29ja2V0Lm9uY29ubmVjdCA9IHRjcFNlcnZlclNvY2tldC5vbmVycm9yID0gbnVsbDtcblxuICAgIHRoaXNbcHJpdmF0ZXMudGNwU2VydmVyU29ja2V0XSA9IG51bGw7XG5cbiAgICB0aGlzLmVtaXQoJ3N0b3AnKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCB7XG4gIFNlcnZlcjogV2ViU29ja2V0U2VydmVyLFxuICBVdGlsczogV2ViU29ja2V0VXRpbHMsXG4gIEZyYW1lQnVmZmVyOiBXZWJTb2NrZXRGcmFtZUJ1ZmZlclxufTtcbiIsIi8qZ2xvYmFsIE1hcCwgU2V0ICovXG5cbmZ1bmN0aW9uIGVuc3VyZVZhbGlkRXZlbnROYW1lKGV2ZW50TmFtZSkge1xuICBpZiAoIWV2ZW50TmFtZSB8fCB0eXBlb2YgZXZlbnROYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBFcnJvcignRXZlbnQgbmFtZSBzaG91bGQgYmUgYSB2YWxpZCBub24tZW1wdHkgc3RyaW5nIScpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVZhbGlkSGFuZGxlcihoYW5kbGVyKSB7XG4gIGlmICh0eXBlb2YgaGFuZGxlciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHRocm93IG5ldyBFcnJvcignSGFuZGxlciBzaG91bGQgYmUgYSBmdW5jdGlvbiEnKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBlbnN1cmVBbGxvd2VkRXZlbnROYW1lKGFsbG93ZWRFdmVudHMsIGV2ZW50TmFtZSkge1xuICBpZiAoYWxsb3dlZEV2ZW50cyAmJiBhbGxvd2VkRXZlbnRzLmluZGV4T2YoZXZlbnROYW1lKSA8IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0V2ZW50IFwiJyArIGV2ZW50TmFtZSArICdcIiBpcyBub3QgYWxsb3dlZCEnKTtcbiAgfVxufVxuXG4vLyBJbXBsZW1lbnRzIHB1Ymxpc2gvc3Vic2NyaWJlIGJlaGF2aW91ciB0aGF0IGNhbiBiZSBhcHBsaWVkIHRvIGFueSBvYmplY3QsXG4vLyBzbyB0aGF0IG9iamVjdCBjYW4gYmUgbGlzdGVuZWQgZm9yIGN1c3RvbSBldmVudHMuIFwidGhpc1wiIGNvbnRleHQgaXMgdGhlXG4vLyBvYmplY3Qgd2l0aCBNYXAgXCJsaXN0ZW5lcnNcIiBwcm9wZXJ0eSB1c2VkIHRvIHN0b3JlIGhhbmRsZXJzLlxudmFyIGV2ZW50RGlzcGF0Y2hlciA9IHtcbiAgLyoqXG4gICAqIFJlZ2lzdGVycyBsaXN0ZW5lciBmdW5jdGlvbiB0byBiZSBleGVjdXRlZCBvbmNlIGV2ZW50IG9jY3Vycy5cbiAgICogQHBhcmFtIHtzdHJpbmd9IGV2ZW50TmFtZSBOYW1lIG9mIHRoZSBldmVudCB0byBsaXN0ZW4gZm9yLlxuICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBoYW5kbGVyIEhhbmRsZXIgdG8gYmUgZXhlY3V0ZWQgb25jZSBldmVudCBvY2N1cnMuXG4gICAqL1xuICBvbjogZnVuY3Rpb24oZXZlbnROYW1lLCBoYW5kbGVyKSB7XG4gICAgZW5zdXJlVmFsaWRFdmVudE5hbWUoZXZlbnROYW1lKTtcbiAgICBlbnN1cmVBbGxvd2VkRXZlbnROYW1lKHRoaXMuYWxsb3dlZEV2ZW50cywgZXZlbnROYW1lKTtcbiAgICBlbnN1cmVWYWxpZEhhbmRsZXIoaGFuZGxlcik7XG5cbiAgICB2YXIgaGFuZGxlcnMgPSB0aGlzLmxpc3RlbmVycy5nZXQoZXZlbnROYW1lKTtcblxuICAgIGlmICghaGFuZGxlcnMpIHtcbiAgICAgIGhhbmRsZXJzID0gbmV3IFNldCgpO1xuICAgICAgdGhpcy5saXN0ZW5lcnMuc2V0KGV2ZW50TmFtZSwgaGFuZGxlcnMpO1xuICAgIH1cblxuICAgIC8vIFNldC5hZGQgaWdub3JlcyBoYW5kbGVyIGlmIGl0IGhhcyBiZWVuIGFscmVhZHkgcmVnaXN0ZXJlZFxuICAgIGhhbmRsZXJzLmFkZChoYW5kbGVyKTtcbiAgfSxcblxuICAvKipcbiAgICogUmVtb3ZlcyByZWdpc3RlcmVkIGxpc3RlbmVyIGZvciB0aGUgc3BlY2lmaWVkIGV2ZW50LlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZXZlbnROYW1lIE5hbWUgb2YgdGhlIGV2ZW50IHRvIHJlbW92ZSBsaXN0ZW5lciBmb3IuXG4gICAqIEBwYXJhbSB7ZnVuY3Rpb259IGhhbmRsZXIgSGFuZGxlciB0byByZW1vdmUsIHNvIGl0IHdvbid0IGJlIGV4ZWN1dGVkXG4gICAqIG5leHQgdGltZSBldmVudCBvY2N1cnMuXG4gICAqL1xuICBvZmY6IGZ1bmN0aW9uKGV2ZW50TmFtZSwgaGFuZGxlcikge1xuICAgIGVuc3VyZVZhbGlkRXZlbnROYW1lKGV2ZW50TmFtZSk7XG4gICAgZW5zdXJlQWxsb3dlZEV2ZW50TmFtZSh0aGlzLmFsbG93ZWRFdmVudHMsIGV2ZW50TmFtZSk7XG4gICAgZW5zdXJlVmFsaWRIYW5kbGVyKGhhbmRsZXIpO1xuXG4gICAgdmFyIGhhbmRsZXJzID0gdGhpcy5saXN0ZW5lcnMuZ2V0KGV2ZW50TmFtZSk7XG5cbiAgICBpZiAoIWhhbmRsZXJzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaGFuZGxlcnMuZGVsZXRlKGhhbmRsZXIpO1xuXG4gICAgaWYgKCFoYW5kbGVycy5zaXplKSB7XG4gICAgICB0aGlzLmxpc3RlbmVycy5kZWxldGUoZXZlbnROYW1lKTtcbiAgICB9XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYWxsIHJlZ2lzdGVyZWQgbGlzdGVuZXJzIGZvciB0aGUgc3BlY2lmaWVkIGV2ZW50LlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZXZlbnROYW1lIE5hbWUgb2YgdGhlIGV2ZW50IHRvIHJlbW92ZSBhbGwgbGlzdGVuZXJzIGZvci5cbiAgICovXG4gIG9mZkFsbDogZnVuY3Rpb24oZXZlbnROYW1lKSB7XG4gICAgaWYgKHR5cGVvZiBldmVudE5hbWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aGlzLmxpc3RlbmVycy5jbGVhcigpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGVuc3VyZVZhbGlkRXZlbnROYW1lKGV2ZW50TmFtZSk7XG4gICAgZW5zdXJlQWxsb3dlZEV2ZW50TmFtZSh0aGlzLmFsbG93ZWRFdmVudHMsIGV2ZW50TmFtZSk7XG5cbiAgICB2YXIgaGFuZGxlcnMgPSB0aGlzLmxpc3RlbmVycy5nZXQoZXZlbnROYW1lKTtcblxuICAgIGlmICghaGFuZGxlcnMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBoYW5kbGVycy5jbGVhcigpO1xuXG4gICAgdGhpcy5saXN0ZW5lcnMuZGVsZXRlKGV2ZW50TmFtZSk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEVtaXRzIHNwZWNpZmllZCBldmVudCBzbyB0aGF0IGFsbCByZWdpc3RlcmVkIGhhbmRsZXJzIHdpbGwgYmUgY2FsbGVkXG4gICAqIHdpdGggdGhlIHNwZWNpZmllZCBwYXJhbWV0ZXJzLlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZXZlbnROYW1lIE5hbWUgb2YgdGhlIGV2ZW50IHRvIGNhbGwgaGFuZGxlcnMgZm9yLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1ldGVycyBPcHRpb25hbCBwYXJhbWV0ZXJzIHRoYXQgd2lsbCBiZSBwYXNzZWQgdG9cbiAgICogZXZlcnkgcmVnaXN0ZXJlZCBoYW5kbGVyLlxuICAgKi9cbiAgZW1pdDogZnVuY3Rpb24oZXZlbnROYW1lLCBwYXJhbWV0ZXJzKSB7XG4gICAgZW5zdXJlVmFsaWRFdmVudE5hbWUoZXZlbnROYW1lKTtcbiAgICBlbnN1cmVBbGxvd2VkRXZlbnROYW1lKHRoaXMuYWxsb3dlZEV2ZW50cywgZXZlbnROYW1lKTtcblxuICAgIHZhciBoYW5kbGVycyA9IHRoaXMubGlzdGVuZXJzLmdldChldmVudE5hbWUpO1xuXG4gICAgaWYgKCFoYW5kbGVycykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGhhbmRsZXJzLmZvckVhY2goZnVuY3Rpb24oaGFuZGxlcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaGFuZGxlcihwYXJhbWV0ZXJzKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQge1xuICAvKipcbiAgICogTWl4ZXMgZGlzcGF0Y2hlciBtZXRob2RzIGludG8gdGFyZ2V0IG9iamVjdC5cbiAgICogQHBhcmFtIHtPYmplY3R9IHRhcmdldCBPYmplY3QgdG8gbWl4IGRpc3BhdGNoZXIgbWV0aG9kcyBpbnRvLlxuICAgKiBAcGFyYW0ge0FycmF5LjxzdHJpbmc+fSBhbGxvd2VkRXZlbnRzIE9wdGlvbmFsIGxpc3Qgb2YgdGhlIGFsbG93ZWQgZXZlbnRcbiAgICogbmFtZXMgdGhhdCBjYW4gYmUgZW1pdHRlZCBhbmQgbGlzdGVuZWQgZm9yLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUYXJnZXQgb2JqZWN0IHdpdGggYWRkZWQgZGlzcGF0Y2hlciBtZXRob2RzLlxuICAgKi9cbiAgbWl4aW46IGZ1bmN0aW9uKHRhcmdldCwgYWxsb3dlZEV2ZW50cykge1xuICAgIGlmICghdGFyZ2V0IHx8IHR5cGVvZiB0YXJnZXQgIT09ICdvYmplY3QnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ09iamVjdCB0byBtaXggaW50byBzaG91bGQgYmUgdmFsaWQgb2JqZWN0IScpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgYWxsb3dlZEV2ZW50cyAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgIUFycmF5LmlzQXJyYXkoYWxsb3dlZEV2ZW50cykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQWxsb3dlZCBldmVudHMgc2hvdWxkIGJlIGEgdmFsaWQgYXJyYXkgb2Ygc3RyaW5ncyEnKTtcbiAgICB9XG5cbiAgICBPYmplY3Qua2V5cyhldmVudERpc3BhdGNoZXIpLmZvckVhY2goZnVuY3Rpb24obWV0aG9kKSB7XG4gICAgICBpZiAodHlwZW9mIHRhcmdldFttZXRob2RdICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgJ09iamVjdCB0byBtaXggaW50byBhbHJlYWR5IGhhcyBcIicgKyBtZXRob2QgKyAnXCIgcHJvcGVydHkgZGVmaW5lZCEnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICB0YXJnZXRbbWV0aG9kXSA9IGV2ZW50RGlzcGF0Y2hlclttZXRob2RdLmJpbmQodGhpcyk7XG4gICAgfSwgeyBsaXN0ZW5lcnM6IG5ldyBNYXAoKSwgYWxsb3dlZEV2ZW50czogYWxsb3dlZEV2ZW50cyB9KTtcblxuICAgIHJldHVybiB0YXJnZXQ7XG4gIH1cbn07XG4iLCJpbXBvcnQgRXZlbnREaXNwYXRjaGVyIGZyb20gJ0V2ZW50RGlzcGF0Y2hlcic7XG5cbnZhciBwcml2YXRlcyA9IHtcbiAgZGF0YTogU3ltYm9sKCdkYXRhJyksXG4gIHBlbmRpbmdEYXRhUmVxdWVzdDogU3ltYm9sKCdwZW5kaW5nRGF0YVJlcXVlc3QnKSxcbiAgc3BsaWNlOiBTeW1ib2woJ3NwbGljZScpXG59O1xuXG5jbGFzcyBXZWJTb2NrZXRGcmFtZUJ1ZmZlciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIEV2ZW50RGlzcGF0Y2hlci5taXhpbih0aGlzLCBbJ2ZyYW1lJywgJ2RhdGEnXSk7XG5cbiAgICB0aGlzW3ByaXZhdGVzLmRhdGFdID0gbmV3IFVpbnQ4QXJyYXkoMCk7XG4gICAgdGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdID0gbnVsbDtcbiAgICB0aGlzW3ByaXZhdGVzLnNwbGljZV0gPSBmdW5jdGlvbihsZW5ndGgpIHtcbiAgICAgIHZhciBkYXRhID0gdGhpc1twcml2YXRlcy5kYXRhXTtcblxuICAgICAgdmFyIHNwbGljZWREYXRhID0gZGF0YS5zdWJhcnJheSgwLCBsZW5ndGgpO1xuICAgICAgdGhpc1twcml2YXRlcy5kYXRhXSA9IGRhdGEuc3ViYXJyYXkobGVuZ3RoLCBkYXRhLmxlbmd0aCk7XG5cbiAgICAgIHJldHVybiBzcGxpY2VkRGF0YTtcbiAgICB9O1xuICB9XG5cbiAgcHV0KGRhdGFUb1B1dCkge1xuICAgIHZhciBkYXRhID0gdGhpc1twcml2YXRlcy5kYXRhXTtcblxuICAgIHZhciBuZXdEYXRhID0gbmV3IFVpbnQ4QXJyYXkoZGF0YS5sZW5ndGggKyBkYXRhVG9QdXQubGVuZ3RoKTtcbiAgICBuZXdEYXRhLnNldChkYXRhKTtcbiAgICBuZXdEYXRhLnNldChkYXRhVG9QdXQsIGRhdGEubGVuZ3RoKTtcbiAgICB0aGlzW3ByaXZhdGVzLmRhdGFdID0gbmV3RGF0YTtcblxuICAgIHRoaXMuZW1pdCgnZGF0YScpO1xuXG4gICAgLy8gSWYgbm8gb25lIHdhaXRpbmcgZm9yIGRhdGEsIGxldCdzIHNpZ25hbCB0aGF0IHdlIGhhdmUgbmV3IGZyYW1lIVxuICAgIGlmICghdGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdKSB7XG4gICAgICB0aGlzLmVtaXQoJ2ZyYW1lJyk7XG4gICAgfVxuICB9XG5cbiAgZ2V0KGRhdGFMZW5ndGgpIHtcbiAgICBpZiAodGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbmN1cnJlbnQgcmVhZCBpcyBub3QgYWxsb3dlZC4nKTtcbiAgICB9XG5cbiAgICB0aGlzW3ByaXZhdGVzLnBlbmRpbmdEYXRhUmVxdWVzdF0gPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgdmFyIGRhdGEgPSB0aGlzW3ByaXZhdGVzLmRhdGFdO1xuICAgICAgaWYgKGRhdGEubGVuZ3RoID49IGRhdGFMZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUodGhpc1twcml2YXRlcy5zcGxpY2VdKGRhdGFMZW5ndGgpKTtcbiAgICAgIH1cblxuICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgdGhpcy5vbignZGF0YScsIGZ1bmN0aW9uIG9uRGF0YSgpIHtcbiAgICAgICAgaWYgKGRhdGEubGVuZ3RoIDwgZGF0YUxlbmd0aCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHNlbGYub2ZmKCdkYXRhJywgb25EYXRhKTtcbiAgICAgICAgcmVzb2x2ZSh0aGlzW3ByaXZhdGVzLnNwbGljZV0oZGF0YUxlbmd0aCkpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGhpc1twcml2YXRlcy5wZW5kaW5nRGF0YVJlcXVlc3RdLnRoZW4oKGRhdGEpID0+IHtcbiAgICAgIHRoaXNbcHJpdmF0ZXMucGVuZGluZ0RhdGFSZXF1ZXN0XSA9IG51bGw7XG4gICAgICByZXR1cm4gZGF0YTtcbiAgICB9KTtcbiAgfVxuXG4gIGlzRW1wdHkoKSB7XG4gICAgcmV0dXJuIHRoaXNbcHJpdmF0ZXMuZGF0YV0ubGVuZ3RoID09PSAwO1xuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBXZWJTb2NrZXRGcmFtZUJ1ZmZlcjtcbiIsInZhciBXZWJTb2NrZXRVdGlscyA9IHtcbiAgLyoqXG4gICAqIE1hc2sgZXZlcnkgZGF0YSBlbGVtZW50IHdpdGggdGhlIG1hc2sgKFdlYlNvY2tldCBzcGVjaWZpYyBhbGdvcml0aG0pLlxuICAgKiBAcGFyYW0ge0FycmF5fSBtYXNrIE1hc2sgYXJyYXkuXG4gICAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IERhdGEgYXJyYXkgdG8gbWFzay5cbiAgICogQHJldHVybnMge0FycmF5fSBNYXNrZWQgZGF0YSBhcnJheS5cbiAgICovXG4gIG1hc2sobWFzaywgYXJyYXkpIHtcbiAgICBpZiAobWFzaykge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykge1xuICAgICAgICBhcnJheVtpXSA9IGFycmF5W2ldIF4gbWFza1tpICUgNF07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBhcnJheTtcbiAgfSxcblxuICAvKipcbiAgICogR2VuZXJhdGVzIDQtaXRlbSBhcnJheSwgZXZlcnkgaXRlbSBvZiB3aGljaCBpcyBlbGVtZW50IG9mIGJ5dGUgbWFzay5cbiAgICogQHJldHVybnMge1VpbnQ4QXJyYXl9XG4gICAqL1xuICBnZW5lcmF0ZVJhbmRvbU1hc2soKSB7XG4gICAgdmFyIHJhbmRvbSA9IG5ldyBVaW50OEFycmF5KDQpO1xuXG4gICAgd2luZG93LmNyeXB0by5nZXRSYW5kb21WYWx1ZXMocmFuZG9tKTtcblxuICAgIHJldHVybiByYW5kb207XG4gIH0sXG5cbiAgLyoqXG4gICAqIENvbnZlcnRzIHN0cmluZyB0byBVaW50OEFycmF5LlxuICAgKiBAcGFyYW0ge3N0cmluZ30gc3RyaW5nVmFsdWUgU3RyaW5nIHZhbHVlIHRvIGNvbnZlcnQuXG4gICAqIEByZXR1cm5zIHtVaW50OEFycmF5fVxuICAgKi9cbiAgc3RyaW5nVG9BcnJheShzdHJpbmdWYWx1ZSkge1xuICAgIGlmICh0eXBlb2Ygc3RyaW5nVmFsdWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N0cmluZ1ZhbHVlIHNob3VsZCBiZSB2YWxpZCBzdHJpbmchJyk7XG4gICAgfVxuXG4gICAgdmFyIGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoc3RyaW5nVmFsdWUubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICBhcnJheVtpXSA9IHN0cmluZ1ZhbHVlLmNoYXJDb2RlQXQoaSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGFycmF5O1xuICB9LFxuXG4gIC8qKlxuICAgKiBDb252ZXJ0cyBhcnJheSB0byBzdHJpbmcuIEV2ZXJ5IGFycmF5IGVsZW1lbnQgaXMgY29uc2lkZXJlZCBhcyBjaGFyIGNvZGUuXG4gICAqIEBwYXJhbSB7VWludDhBcnJheX0gYXJyYXkgQXJyYXkgd2l0aCB0aGUgY2hhciBjb2Rlcy5cbiAgICogQHJldHVybnMge3N0cmluZ31cbiAgICovXG4gIGFycmF5VG9TdHJpbmcoYXJyYXkpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBhcnJheSk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJlYWRzIHVuc2lnbmVkIDE2IGJpdCB2YWx1ZSBmcm9tIHR3byBjb25zZXF1ZW50IDgtYml0IGFycmF5IGVsZW1lbnRzLlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGFycmF5IEFycmF5IHRvIHJlYWQgZnJvbS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBJbmRleCB0byBzdGFydCByZWFkIHZhbHVlLlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKi9cbiAgcmVhZFVJbnQxNihhcnJheSwgb2Zmc2V0KSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG4gICAgcmV0dXJuIChhcnJheVtvZmZzZXRdIDw8IDgpICsgYXJyYXlbb2Zmc2V0ICsgMV07XG4gIH0sXG5cbiAgLyoqXG4gICAqIFJlYWRzIHVuc2lnbmVkIDMyIGJpdCB2YWx1ZSBmcm9tIGZvdXIgY29uc2VxdWVudCA4LWJpdCBhcnJheSBlbGVtZW50cy5cbiAgICogQHBhcmFtIHtVaW50OEFycmF5fSBhcnJheSBBcnJheSB0byByZWFkIGZyb20uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBvZmZzZXQgSW5kZXggdG8gc3RhcnQgcmVhZCB2YWx1ZS5cbiAgICogQHJldHVybnMge051bWJlcn1cbiAgICovXG4gIHJlYWRVSW50MzIoYXJyYXksIG9mZnNldCkge1xuICAgIG9mZnNldCA9IG9mZnNldCB8fCAwO1xuICAgIHJldHVybiAoYXJyYXlbb2Zmc2V0XSA8PCAyNCkgK1xuICAgICAgKGFycmF5W29mZnNldCArIDFdIDw8IDE2KSArXG4gICAgICAoYXJyYXkgW29mZnNldCArIDJdIDw8IDgpICtcbiAgICAgIGFycmF5W29mZnNldCArIDNdO1xuICB9LFxuXG4gIC8qKlxuICAgKiBXcml0ZXMgdW5zaWduZWQgMTYgYml0IHZhbHVlIHRvIHR3byBjb25zZXF1ZW50IDgtYml0IGFycmF5IGVsZW1lbnRzLlxuICAgKiBAcGFyYW0ge1VpbnQ4QXJyYXl9IGFycmF5IEFycmF5IHRvIHdyaXRlIHRvLlxuICAgKiBAcGFyYW0ge051bWJlcn0gdmFsdWUgMTYgYml0IHVuc2lnbmVkIHZhbHVlIHRvIHdyaXRlIGludG8gYXJyYXkuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBvZmZzZXQgSW5kZXggdG8gc3RhcnQgd3JpdGUgdmFsdWUuXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAqL1xuICB3cml0ZVVJbnQxNihhcnJheSwgdmFsdWUsIG9mZnNldCkge1xuICAgIGFycmF5W29mZnNldF0gPSAodmFsdWUgJiAweGZmMDApID4+IDg7XG4gICAgYXJyYXlbb2Zmc2V0ICsgMV0gPSB2YWx1ZSAmIDB4ZmY7XG4gIH0sXG5cbiAgLyoqXG4gICAqIFdyaXRlcyB1bnNpZ25lZCAxNiBiaXQgdmFsdWUgdG8gdHdvIGNvbnNlcXVlbnQgOC1iaXQgYXJyYXkgZWxlbWVudHMuXG4gICAqIEBwYXJhbSB7VWludDhBcnJheX0gYXJyYXkgQXJyYXkgdG8gd3JpdGUgdG8uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSB2YWx1ZSAxNiBiaXQgdW5zaWduZWQgdmFsdWUgdG8gd3JpdGUgaW50byBhcnJheS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBJbmRleCB0byBzdGFydCB3cml0ZSB2YWx1ZS5cbiAgICogQHJldHVybnMge051bWJlcn1cbiAgICovXG4gIHdyaXRlVUludDMyKGFycmF5LCB2YWx1ZSwgb2Zmc2V0KSB7XG4gICAgYXJyYXlbb2Zmc2V0XSA9ICh2YWx1ZSAmIDB4ZmYwMDAwMDApID4+IDI0O1xuICAgIGFycmF5W29mZnNldCArIDFdID0gKHZhbHVlICYgMHhmZjAwMDApID4+IDE2O1xuICAgIGFycmF5W29mZnNldCArIDJdID0gKHZhbHVlICYgMHhmZjAwKSA+PiA4O1xuICAgIGFycmF5W29mZnNldCArIDNdID0gdmFsdWUgJiAweGZmO1xuICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBXZWJTb2NrZXRVdGlscztcbiJdfQ==
