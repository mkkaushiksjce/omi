(function () {
	'use strict';

	/** Virtual DOM Node */
	function VNode() {}

	/** Global options
	 *	@public
	 *	@namespace options {Object}
	 */
	var options = {

		scopedStyle: true,
		$store: null
		/** If `true`, `prop` changes trigger synchronous component updates.
	  *	@name syncComponentUpdates
	  *	@type Boolean
	  *	@default true
	  */
		//syncComponentUpdates: true,

		/** Processes all created VNodes.
	  *	@param {VNode} vnode	A newly-created VNode to normalize/process
	  */
		//vnode(vnode) { }

		/** Hook invoked after a component is mounted. */
		// afterMount(component) { }

		/** Hook invoked after the DOM is updated with a component's latest render. */
		// afterUpdate(component) { }

		/** Hook invoked immediately before a component is unmounted. */
		// beforeUnmount(component) { }
	};

	var stack = [];

	var EMPTY_CHILDREN = [];

	/**
	 * JSX/hyperscript reviver.
	 * @see http://jasonformat.com/wtf-is-jsx
	 * Benchmarks: https://esbench.com/bench/57ee8f8e330ab09900a1a1a0
	 *
	 * Note: this is exported as both `h()` and `createElement()` for compatibility reasons.
	 *
	 * Creates a VNode (virtual DOM element). A tree of VNodes can be used as a lightweight representation
	 * of the structure of a DOM tree. This structure can be realized by recursively comparing it against
	 * the current _actual_ DOM structure, and applying only the differences.
	 *
	 * `h()`/`createElement()` accepts an element name, a list of attributes/props,
	 * and optionally children to append to the element.
	 *
	 * @example The following DOM tree
	 *
	 * `<div id="foo" name="bar">Hello!</div>`
	 *
	 * can be constructed using this function as:
	 *
	 * `h('div', { id: 'foo', name : 'bar' }, 'Hello!');`
	 *
	 * @param {string} nodeName	An element name. Ex: `div`, `a`, `span`, etc.
	 * @param {Object} attributes	Any attributes/props to set on the created element.
	 * @param rest			Additional arguments are taken to be children to append. Can be infinitely nested Arrays.
	 *
	 * @public
	 */
	function h(nodeName, attributes) {
		var children = EMPTY_CHILDREN,
		    lastSimple = void 0,
		    child = void 0,
		    simple = void 0,
		    i = void 0;
		for (i = arguments.length; i-- > 2;) {
			stack.push(arguments[i]);
		}
		if (attributes && attributes.children != null) {
			if (!stack.length) stack.push(attributes.children);
			delete attributes.children;
		}
		while (stack.length) {
			if ((child = stack.pop()) && child.pop !== undefined) {
				for (i = child.length; i--;) {
					stack.push(child[i]);
				}
			} else {
				if (typeof child === 'boolean') child = null;

				if (simple = typeof nodeName !== 'function') {
					if (child == null) child = '';else if (typeof child === 'number') child = String(child);else if (typeof child !== 'string') simple = false;
				}

				if (simple && lastSimple) {
					children[children.length - 1] += child;
				} else if (children === EMPTY_CHILDREN) {
					children = [child];
				} else {
					children.push(child);
				}

				lastSimple = simple;
			}
		}

		var p = new VNode();
		p.nodeName = nodeName;
		p.children = children;
		p.attributes = attributes == null ? undefined : attributes;
		p.key = attributes == null ? undefined : attributes.key;

		// if a "vnode hook" is defined, pass every created VNode to it
		if (options.vnode !== undefined) options.vnode(p);

		return p;
	}

	/**
	 *  Copy all properties from `props` onto `obj`.
	 *  @param {Object} obj		Object onto which properties should be copied.
	 *  @param {Object} props	Object from which to copy properties.
	 *  @returns obj
	 *  @private
	 */
	function extend(obj, props) {
	  for (var i in props) {
	    obj[i] = props[i];
	  }return obj;
	}

	/**
	 * Call a function asynchronously, as soon as possible. Makes
	 * use of HTML Promise to schedule the callback if available,
	 * otherwise falling back to `setTimeout` (mainly for IE<11).
	 *
	 * @param {Function} callback
	 */
	var defer = typeof Promise == 'function' ? Promise.resolve().then.bind(Promise.resolve()) : setTimeout;

	/**
	 * Clones the given VNode, optionally adding attributes/props and replacing its children.
	 * @param {VNode} vnode		The virtual DOM element to clone
	 * @param {Object} props	Attributes/props to add when cloning
	 * @param {VNode} rest		Any additional arguments will be used as replacement children.
	 */
	function cloneElement(vnode, props) {
	  return h(vnode.nodeName, extend(extend({}, vnode.attributes), props), arguments.length > 2 ? [].slice.call(arguments, 2) : vnode.children);
	}

	// render modes

	var NO_RENDER = 0;
	var SYNC_RENDER = 1;
	var FORCE_RENDER = 2;
	var ASYNC_RENDER = 3;

	var ATTR_KEY = '__preactattr_';

	// DOM properties that should NOT have "px" added when numeric
	var IS_NON_DIMENSIONAL = /acit|ex(?:s|g|n|p|$)|rph|ows|mnc|ntw|ine[ch]|zoo|^ord/i;

	/** Managed queue of dirty components to be re-rendered */

	var items = [];

	function enqueueRender(component) {
		if (!component._dirty && (component._dirty = true) && items.push(component) == 1) {
			(options.debounceRendering || defer)(rerender);
		}
	}

	function rerender() {
		var p = void 0,
		    list = items;
		items = [];
		while (p = list.pop()) {
			if (p._dirty) renderComponent(p);
		}
	}

	/**
	 * Check if two nodes are equivalent.
	 *
	 * @param {Node} node			DOM Node to compare
	 * @param {VNode} vnode			Virtual DOM node to compare
	 * @param {boolean} [hydrating=false]	If true, ignores component constructors when comparing.
	 * @private
	 */
	function isSameNodeType(node, vnode, hydrating) {
	  if (typeof vnode === 'string' || typeof vnode === 'number') {
	    return node.splitText !== undefined;
	  }
	  if (typeof vnode.nodeName === 'string') {
	    return !node._componentConstructor && isNamedNode(node, vnode.nodeName);
	  }
	  return hydrating || node._componentConstructor === vnode.nodeName;
	}

	/**
	 * Check if an Element has a given nodeName, case-insensitively.
	 *
	 * @param {Element} node	A DOM Element to inspect the name of.
	 * @param {String} nodeName	Unnormalized name to compare against.
	 */
	function isNamedNode(node, nodeName) {
	  return node.normalizedNodeName === nodeName || node.nodeName.toLowerCase() === nodeName.toLowerCase();
	}

	/**
	 * Reconstruct Component-style `props` from a VNode.
	 * Ensures default/fallback values from `defaultProps`:
	 * Own-properties of `defaultProps` not present in `vnode.attributes` are added.
	 *
	 * @param {VNode} vnode
	 * @returns {Object} props
	 */
	function getNodeProps(vnode) {
	  var props = extend({}, vnode.attributes);
	  props.children = vnode.children;

	  var defaultProps = vnode.nodeName.defaultProps;
	  if (defaultProps !== undefined) {
	    for (var i in defaultProps) {
	      if (props[i] === undefined) {
	        props[i] = defaultProps[i];
	      }
	    }
	  }

	  return props;
	}

	/** Create an element with the given nodeName.
	 *	@param {String} nodeName
	 *	@param {Boolean} [isSvg=false]	If `true`, creates an element within the SVG namespace.
	 *	@returns {Element} node
	 */
	function createNode(nodeName, isSvg) {
		var node = isSvg ? document.createElementNS('http://www.w3.org/2000/svg', nodeName) : document.createElement(nodeName);
		node.normalizedNodeName = nodeName;
		return node;
	}

	/** Remove a child node from its parent if attached.
	 *	@param {Element} node		The node to remove
	 */
	function removeNode(node) {
		var parentNode = node.parentNode;
		if (parentNode) parentNode.removeChild(node);
	}

	/** Set a named attribute on the given Node, with special behavior for some names and event handlers.
	 *	If `value` is `null`, the attribute/handler will be removed.
	 *	@param {Element} node	An element to mutate
	 *	@param {string} name	The name/key to set, such as an event or attribute name
	 *	@param {any} old	The last value that was set for this name/node pair
	 *	@param {any} value	An attribute value, such as a function to be used as an event handler
	 *	@param {Boolean} isSvg	Are we currently diffing inside an svg?
	 *	@private
	 */
	function setAccessor(node, name, old, value, isSvg) {
		if (name === 'className') name = 'class';

		if (name === 'key') {
			// ignore
		} else if (name === 'ref') {
			if (old) old(null);
			if (value) value(node);
		} else if (name === 'class' && !isSvg) {
			node.className = value || '';
		} else if (name === 'style') {
			if (!value || typeof value === 'string' || typeof old === 'string') {
				node.style.cssText = value || '';
			}
			if (value && typeof value === 'object') {
				if (typeof old !== 'string') {
					for (var i in old) {
						if (!(i in value)) node.style[i] = '';
					}
				}
				for (var _i in value) {
					node.style[_i] = typeof value[_i] === 'number' && IS_NON_DIMENSIONAL.test(_i) === false ? value[_i] + 'px' : value[_i];
				}
			}
		} else if (name === 'dangerouslySetInnerHTML') {
			if (value) node.innerHTML = value.__html || '';
		} else if (name[0] == 'o' && name[1] == 'n') {
			var useCapture = name !== (name = name.replace(/Capture$/, ''));
			name = name.toLowerCase().substring(2);
			if (value) {
				if (!old) node.addEventListener(name, eventProxy, useCapture);
			} else {
				node.removeEventListener(name, eventProxy, useCapture);
			}
			(node._listeners || (node._listeners = {}))[name] = value;
		} else if (name !== 'list' && name !== 'type' && !isSvg && name in node) {
			setProperty(node, name, value == null ? '' : value);
			if (value == null || value === false) node.removeAttribute(name);
		} else {
			var ns = isSvg && name !== (name = name.replace(/^xlink:?/, ''));
			if (value == null || value === false) {
				if (ns) node.removeAttributeNS('http://www.w3.org/1999/xlink', name.toLowerCase());else node.removeAttribute(name);
			} else if (typeof value !== 'function') {
				if (ns) node.setAttributeNS('http://www.w3.org/1999/xlink', name.toLowerCase(), value);else node.setAttribute(name, value);
			}
		}
	}

	/** Attempt to set a DOM property to the given value.
	 *	IE & FF throw for certain property-value combinations.
	 */
	function setProperty(node, name, value) {
		try {
			node[name] = value;
		} catch (e) {}
	}

	/** Proxy an event to hooked event handlers
	 *	@private
	 */
	function eventProxy(e) {
		return this._listeners[e.type](options.event && options.event(e) || e);
	}

	/** Queue of components that have been mounted and are awaiting componentDidMount */
	var mounts = [];

	/** Diff recursion count, used to track the end of the diff cycle. */
	var diffLevel = 0;

	/** Global flag indicating if the diff is currently within an SVG */
	var isSvgMode = false;

	/** Global flag indicating if the diff is performing hydration */
	var hydrating = false;

	/** Invoke queued componentDidMount lifecycle methods */
	function flushMounts() {
		var c = void 0;
		while (c = mounts.pop()) {
			if (options.afterMount) options.afterMount(c);
			if (c.componentDidMount) c.componentDidMount();
			if (c.installed) c.installed();
		}
	}

	/** Apply differences in a given vnode (and it's deep children) to a real DOM Node.
	 *	@param {Element} [dom=null]		A DOM node to mutate into the shape of the `vnode`
	 *	@param {VNode} vnode			A VNode (with descendants forming a tree) representing the desired DOM structure
	 *	@returns {Element} dom			The created/mutated element
	 *	@private
	 */
	function diff(dom, vnode, context, mountAll, parent, componentRoot) {
		// diffLevel having been 0 here indicates initial entry into the diff (not a subdiff)
		if (!diffLevel++) {
			// when first starting the diff, check if we're diffing an SVG or within an SVG
			isSvgMode = parent != null && parent.ownerSVGElement !== undefined;

			// hydration is indicated by the existing element to be diffed not having a prop cache
			hydrating = dom != null && !(ATTR_KEY in dom);
		}

		var ret = idiff(dom, vnode, context, mountAll, componentRoot);

		// append the element if its a new parent
		if (parent && ret.parentNode !== parent) parent.appendChild(ret);

		// diffLevel being reduced to 0 means we're exiting the diff
		if (! --diffLevel) {
			hydrating = false;
			// invoke queued componentDidMount lifecycle methods
			if (!componentRoot) flushMounts();
		}

		return ret;
	}

	/** Internals of `diff()`, separated to allow bypassing diffLevel / mount flushing. */
	function idiff(dom, vnode, context, mountAll, componentRoot) {
		var out = dom,
		    prevSvgMode = isSvgMode;

		// empty values (null, undefined, booleans) render as empty Text nodes
		if (vnode == null || typeof vnode === 'boolean') vnode = '';

		// Fast case: Strings & Numbers create/update Text nodes.
		if (typeof vnode === 'string' || typeof vnode === 'number') {

			// update if it's already a Text node:
			if (dom && dom.splitText !== undefined && dom.parentNode && (!dom._component || componentRoot)) {
				/* istanbul ignore if */ /* Browser quirk that can't be covered: https://github.com/developit/preact/commit/fd4f21f5c45dfd75151bd27b4c217d8003aa5eb9 */
				if (dom.nodeValue != vnode) {
					dom.nodeValue = vnode;
				}
			} else {
				// it wasn't a Text node: replace it with one and recycle the old Element
				out = document.createTextNode(vnode);
				if (dom) {
					if (dom.parentNode) dom.parentNode.replaceChild(out, dom);
					recollectNodeTree(dom, true);
				}
			}

			out[ATTR_KEY] = true;

			return out;
		}

		// If the VNode represents a Component, perform a component diff:
		var vnodeName = vnode.nodeName;
		if (typeof vnodeName === 'function') {
			return buildComponentFromVNode(dom, vnode, context, mountAll);
		}

		// Tracks entering and exiting SVG namespace when descending through the tree.
		isSvgMode = vnodeName === 'svg' ? true : vnodeName === 'foreignObject' ? false : isSvgMode;

		// If there's no existing element or it's the wrong type, create a new one:
		vnodeName = String(vnodeName);
		if (!dom || !isNamedNode(dom, vnodeName)) {
			out = createNode(vnodeName, isSvgMode);

			if (dom) {
				// move children into the replacement node
				while (dom.firstChild) {
					out.appendChild(dom.firstChild);
				} // if the previous Element was mounted into the DOM, replace it inline
				if (dom.parentNode) dom.parentNode.replaceChild(out, dom);

				// recycle the old element (skips non-Element node types)
				recollectNodeTree(dom, true);
			}
		}

		var fc = out.firstChild,
		    props = out[ATTR_KEY],
		    vchildren = vnode.children;

		if (props == null) {
			props = out[ATTR_KEY] = {};
			for (var a = out.attributes, i = a.length; i--;) {
				props[a[i].name] = a[i].value;
			}
		}

		// Optimization: fast-path for elements containing a single TextNode:
		if (!hydrating && vchildren && vchildren.length === 1 && typeof vchildren[0] === 'string' && fc != null && fc.splitText !== undefined && fc.nextSibling == null) {
			if (fc.nodeValue != vchildren[0]) {
				fc.nodeValue = vchildren[0];
			}
		}
		// otherwise, if there are existing or new children, diff them:
		else if (vchildren && vchildren.length || fc != null) {
				innerDiffNode(out, vchildren, context, mountAll, hydrating || props.dangerouslySetInnerHTML != null);
			}

		// Apply attributes/props from VNode to the DOM Element:
		diffAttributes(out, vnode.attributes, props);

		// restore previous SVG mode: (in case we're exiting an SVG namespace)
		isSvgMode = prevSvgMode;

		return out;
	}

	/** Apply child and attribute changes between a VNode and a DOM Node to the DOM.
	 *	@param {Element} dom			Element whose children should be compared & mutated
	 *	@param {Array} vchildren		Array of VNodes to compare to `dom.childNodes`
	 *	@param {Object} context			Implicitly descendant context object (from most recent `getChildContext()`)
	 *	@param {Boolean} mountAll
	 *	@param {Boolean} isHydrating	If `true`, consumes externally created elements similar to hydration
	 */
	function innerDiffNode(dom, vchildren, context, mountAll, isHydrating) {
		var originalChildren = dom.childNodes,
		    children = [],
		    keyed = {},
		    keyedLen = 0,
		    min = 0,
		    len = originalChildren.length,
		    childrenLen = 0,
		    vlen = vchildren ? vchildren.length : 0,
		    j = void 0,
		    c = void 0,
		    f = void 0,
		    vchild = void 0,
		    child = void 0;

		// Build up a map of keyed children and an Array of unkeyed children:
		if (len !== 0) {
			for (var i = 0; i < len; i++) {
				var _child = originalChildren[i],
				    props = _child[ATTR_KEY],
				    key = vlen && props ? _child._component ? _child._component.__key : props.key : null;
				if (key != null) {
					keyedLen++;
					keyed[key] = _child;
				} else if (props || (_child.splitText !== undefined ? isHydrating ? _child.nodeValue.trim() : true : isHydrating)) {
					children[childrenLen++] = _child;
				}
			}
		}

		if (vlen !== 0) {
			for (var _i = 0; _i < vlen; _i++) {
				vchild = vchildren[_i];
				child = null;

				// attempt to find a node based on key matching
				var _key = vchild.key;
				if (_key != null) {
					if (keyedLen && keyed[_key] !== undefined) {
						child = keyed[_key];
						keyed[_key] = undefined;
						keyedLen--;
					}
				}
				// attempt to pluck a node of the same type from the existing children
				else if (!child && min < childrenLen) {
						for (j = min; j < childrenLen; j++) {
							if (children[j] !== undefined && isSameNodeType(c = children[j], vchild, isHydrating)) {
								child = c;
								children[j] = undefined;
								if (j === childrenLen - 1) childrenLen--;
								if (j === min) min++;
								break;
							}
						}
					}

				// morph the matched/found/created DOM child to match vchild (deep)
				child = idiff(child, vchild, context, mountAll);

				f = originalChildren[_i];
				if (child && child !== dom && child !== f) {
					if (f == null) {
						dom.appendChild(child);
					} else if (child === f.nextSibling) {
						removeNode(f);
					} else {
						dom.insertBefore(child, f);
					}
				}
			}
		}

		// remove unused keyed children:
		if (keyedLen) {
			for (var _i2 in keyed) {
				if (keyed[_i2] !== undefined) recollectNodeTree(keyed[_i2], false);
			}
		}

		// remove orphaned unkeyed children:
		while (min <= childrenLen) {
			if ((child = children[childrenLen--]) !== undefined) recollectNodeTree(child, false);
		}
	}

	/** Recursively recycle (or just unmount) a node and its descendants.
	 *	@param {Node} node						DOM node to start unmount/removal from
	 *	@param {Boolean} [unmountOnly=false]	If `true`, only triggers unmount lifecycle, skips removal
	 */
	function recollectNodeTree(node, unmountOnly) {
		var component = node._component;
		if (component) {
			// if node is owned by a Component, unmount that component (ends up recursing back here)
			unmountComponent(component);
		} else {
			// If the node's VNode had a ref function, invoke it with null here.
			// (this is part of the React spec, and smart for unsetting references)
			if (node[ATTR_KEY] != null && node[ATTR_KEY].ref) node[ATTR_KEY].ref(null);

			if (unmountOnly === false || node[ATTR_KEY] == null) {
				removeNode(node);
			}

			removeChildren(node);
		}
	}

	/** Recollect/unmount all children.
	 *	- we use .lastChild here because it causes less reflow than .firstChild
	 *	- it's also cheaper than accessing the .childNodes Live NodeList
	 */
	function removeChildren(node) {
		node = node.lastChild;
		while (node) {
			var next = node.previousSibling;
			recollectNodeTree(node, true);
			node = next;
		}
	}

	/** Apply differences in attributes from a VNode to the given DOM Element.
	 *	@param {Element} dom		Element with attributes to diff `attrs` against
	 *	@param {Object} attrs		The desired end-state key-value attribute pairs
	 *	@param {Object} old			Current/previous attributes (from previous VNode or element's prop cache)
	 */
	function diffAttributes(dom, attrs, old) {
		var name = void 0;

		// remove attributes no longer present on the vnode by setting them to undefined
		for (name in old) {
			if (!(attrs && attrs[name] != null) && old[name] != null) {
				setAccessor(dom, name, old[name], old[name] = undefined, isSvgMode);
			}
		}

		// add new & update changed attributes
		for (name in attrs) {
			if (name !== 'children' && name !== 'innerHTML' && (!(name in old) || attrs[name] !== (name === 'value' || name === 'checked' ? dom[name] : old[name]))) {
				setAccessor(dom, name, old[name], old[name] = attrs[name], isSvgMode);
			}
		}
	}

	/** Retains a pool of Components for re-use, keyed on component name.
	 *	Note: since component names are not unique or even necessarily available, these are primarily a form of sharding.
	 *	@private
	 */
	var components = {};

	/** Reclaim a component for later re-use by the recycler. */
	function collectComponent(component) {
		var name = component.constructor.name;
		(components[name] || (components[name] = [])).push(component);
	}

	/** Create a component. Normalizes differences between PFC's and classful Components. */
	function createComponent(Ctor, props, context) {
		var list = components[Ctor.name],
		    inst = void 0;

		if (Ctor.prototype && Ctor.prototype.render) {
			inst = new Ctor(props, context);
			Component.call(inst, props, context);
		} else {
			inst = new Component(props, context);
			inst.constructor = Ctor;
			inst.render = doRender;
		}
		inst.$store = options.$store;
		if (window && window.Omi) {
			window.Omi.instances.push(inst);
		}

		if (list) {
			for (var i = list.length; i--;) {
				if (list[i].constructor === Ctor) {
					inst.nextBase = list[i].nextBase;
					list.splice(i, 1);
					break;
				}
			}
		}
		return inst;
	}

	/** The `.render()` method for a PFC backing instance. */
	function doRender(props, state, context) {
		return this.constructor(props, context);
	}

	// many thanks to https://github.com/thomaspark/scoper/
	function scoper(css, prefix) {
		prefix = '[' + prefix.toLowerCase() + ']';
		// https://www.w3.org/TR/css-syntax-3/#lexical
		css = css.replace(/\/\*[^*]*\*+([^/][^*]*\*+)*\//g, '');
		// eslint-disable-next-line
		var re = new RegExp('([^\r\n,{}:]+)(:[^\r\n,{}]+)?(,(?=[^{}]*{)|\s*{)', 'g');
		/**
	     * Example:
	     *
	     * .classname::pesudo { color:red }
	     *
	     * g1 is normal selector `.classname`
	     * g2 is pesudo class or pesudo element
	     * g3 is the suffix
	     */
		css = css.replace(re, function (g0, g1, g2, g3) {
			if (typeof g2 === 'undefined') {
				g2 = '';
			}

			/* eslint-ignore-next-line */
			if (g1.match(/^\s*(@media|\d+%?|@-webkit-keyframes|@keyframes|to|from|@font-face)/)) {
				return g1 + g2 + g3;
			}

			var appendClass = g1.replace(/(\s*)$/, '') + prefix + g2;
			var prependClass = prefix + ' ' + g1.trim() + g2;
			return appendClass + ',' + prependClass + g3;
		});

		return css;
	}

	function addStyle(cssText, id) {
		id = id.toLowerCase();
		var ele = document.getElementById(id);
		var head = document.getElementsByTagName('head')[0];
		if (ele && ele.parentNode === head) {
			head.removeChild(ele);
		}

		var someThingStyles = document.createElement('style');
		head.appendChild(someThingStyles);
		someThingStyles.setAttribute('type', 'text/css');
		someThingStyles.setAttribute('id', id);
		if (window.ActiveXObject) {
			someThingStyles.styleSheet.cssText = cssText;
		} else {
			someThingStyles.textContent = cssText;
		}
	}

	function addStyleWithoutId(cssText) {
		var head = document.getElementsByTagName('head')[0];
		var someThingStyles = document.createElement('style');
		head.appendChild(someThingStyles);
		someThingStyles.setAttribute('type', 'text/css');

		if (window.ActiveXObject) {
			someThingStyles.styleSheet.cssText = cssText;
		} else {
			someThingStyles.textContent = cssText;
		}
	}

	/** Set a component's `props` (generally derived from JSX attributes).
	 *	@param {Object} props
	 *	@param {Object} [opts]
	 *	@param {boolean} [opts.renderSync=false]	If `true` and {@link options.syncComponentUpdates} is `true`, triggers synchronous rendering.
	 *	@param {boolean} [opts.render=true]			If `false`, no render will be triggered.
	 */
	function setComponentProps(component, props, opts, context, mountAll) {
		if (component._disable) return;
		component._disable = true;

		if (component.__ref = props.ref) delete props.ref;
		if (component.__key = props.key) delete props.key;

		if (!component.base || mountAll) {
			if (component.componentWillMount) component.componentWillMount();
			if (component.install) component.install();
		} else if (component.componentWillReceiveProps) {
			component.componentWillReceiveProps(props, context);
		}

		if (context && context !== component.context) {
			if (!component.prevContext) component.prevContext = component.context;
			component.context = context;
		}

		if (!component.prevProps) component.prevProps = component.props;
		component.props = props;

		component._disable = false;

		if (opts !== NO_RENDER) {
			if (opts === SYNC_RENDER || options.syncComponentUpdates !== false || !component.base) {
				renderComponent(component, SYNC_RENDER, mountAll);
			} else {
				enqueueRender(component);
			}
		}

		if (component.__ref) component.__ref(component);
	}

	function addScopedAttr(vdom, style, attr, component) {
		if (options.scopedStyle) {
			scopeVdom(attr, vdom);
			style = scoper(style, attr);
			if (style !== component._preStyle) {
				addStyle(style, attr);
			}
		} else if (style !== component._preStyle) {
			addStyleWithoutId(style);
		}
		component._preStyle = style;
	}

	function addScopedAttrStatic(vdom, style, attr, firstTime) {
		if (options.scopedStyle) {
			scopeVdom(attr, vdom);
			if (firstTime) {
				addStyle(scoper(style, attr), attr);
			}
		} else if (firstTime) {
			addStyleWithoutId(style);
		}
	}

	function scopeVdom(attr, vdom) {
		if (typeof vdom !== 'string') {
			vdom.attributes = vdom.attributes || {};
			vdom.attributes[attr] = '';
			vdom.children.forEach(function (child) {
				return scopeVdom(attr, child);
			});
		}
	}

	/** Render a Component, triggering necessary lifecycle events and taking High-Order Components into account.
	 *	@param {Component} component
	 *	@param {Object} [opts]
	 *	@param {boolean} [opts.build=false]		If `true`, component will build and store a DOM node if not already associated with one.
	 *	@private
	 */
	function renderComponent(component, opts, mountAll, isChild) {
		if (component._disable) return;

		var props = component.props,
		    state = component.state,
		    context = component.context,
		    previousProps = component.prevProps || props,
		    previousState = component.prevState || state,
		    previousContext = component.prevContext || context,
		    isUpdate = component.base,
		    nextBase = component.nextBase,
		    initialBase = isUpdate || nextBase,
		    initialChildComponent = component._component,
		    skip = false,
		    rendered = void 0,
		    inst = void 0,
		    cbase = void 0;

		// if updating
		if (isUpdate) {
			component.props = previousProps;
			component.state = previousState;
			component.context = previousContext;
			if (opts !== FORCE_RENDER && component.shouldComponentUpdate && component.shouldComponentUpdate(props, state, context) === false) {
				skip = true;
			} else if (component.componentWillUpdate) {
				component.componentWillUpdate(props, state, context);
			} else if (component.beforeUpdate) {
				component.beforeUpdate(props, state, context);
			}
			component.props = props;
			component.state = state;
			component.context = context;
		}

		component.prevProps = component.prevState = component.prevContext = component.nextBase = null;
		component._dirty = false;

		if (!skip) {
			rendered = component.render(props, state, context);

			if (component.style) {
				addScopedAttr(rendered, component.style(), '_style_' + component._id, component);
			}

			//don't rerender
			if (component.staticStyle) {
				addScopedAttrStatic(rendered, component.staticStyle(), '_style_' + component.constructor.name, !component.base);
			}

			// context to pass to the child, can be updated via (grand-)parent component
			if (component.getChildContext) {
				context = extend(extend({}, context), component.getChildContext());
			}

			var childComponent = rendered && rendered.nodeName,
			    toUnmount = void 0,
			    base = void 0;

			if (typeof childComponent === 'function') {
				// set up high order component link

				var childProps = getNodeProps(rendered);
				inst = initialChildComponent;

				if (inst && inst.constructor === childComponent && childProps.key == inst.__key) {
					setComponentProps(inst, childProps, SYNC_RENDER, context, false);
				} else {
					toUnmount = inst;

					component._component = inst = createComponent(childComponent, childProps, context);
					inst.nextBase = inst.nextBase || nextBase;
					inst._parentComponent = component;
					setComponentProps(inst, childProps, NO_RENDER, context, false);
					renderComponent(inst, SYNC_RENDER, mountAll, true);
				}

				base = inst.base;
			} else {
				cbase = initialBase;

				// destroy high order component link
				toUnmount = initialChildComponent;
				if (toUnmount) {
					cbase = component._component = null;
				}

				if (initialBase || opts === SYNC_RENDER) {
					if (cbase) cbase._component = null;
					base = diff(cbase, rendered, context, mountAll || !isUpdate, initialBase && initialBase.parentNode, true);
				}
			}

			if (initialBase && base !== initialBase && inst !== initialChildComponent) {
				var baseParent = initialBase.parentNode;
				if (baseParent && base !== baseParent) {
					baseParent.replaceChild(base, initialBase);

					if (!toUnmount) {
						initialBase._component = null;
						recollectNodeTree(initialBase, false);
					}
				}
			}

			if (toUnmount) {
				unmountComponent(toUnmount);
			}

			component.base = base;
			if (base && !isChild) {
				var componentRef = component,
				    t = component;
				while (t = t._parentComponent) {
					(componentRef = t).base = base;
				}
				base._component = componentRef;
				base._componentConstructor = componentRef.constructor;
			}
		}

		if (!isUpdate || mountAll) {
			mounts.unshift(component);
		} else if (!skip) {
			// Ensure that pending componentDidMount() hooks of child components
			// are called before the componentDidUpdate() hook in the parent.
			// Note: disabled as it causes duplicate hooks, see https://github.com/developit/preact/issues/750
			// flushMounts();

			if (component.componentDidUpdate) {
				component.componentDidUpdate(previousProps, previousState, previousContext);
			}
			if (component.afterUpdate) {
				component.afterUpdate(previousProps, previousState, previousContext);
			}
			if (options.afterUpdate) options.afterUpdate(component);
		}

		if (component._renderCallbacks != null) {
			while (component._renderCallbacks.length) {
				component._renderCallbacks.pop().call(component);
			}
		}

		if (!diffLevel && !isChild) flushMounts();
	}

	/** Apply the Component referenced by a VNode to the DOM.
	 *	@param {Element} dom	The DOM node to mutate
	 *	@param {VNode} vnode	A Component-referencing VNode
	 *	@returns {Element} dom	The created/mutated element
	 *	@private
	 */
	function buildComponentFromVNode(dom, vnode, context, mountAll) {
		var c = dom && dom._component,
		    originalComponent = c,
		    oldDom = dom,
		    isDirectOwner = c && dom._componentConstructor === vnode.nodeName,
		    isOwner = isDirectOwner,
		    props = getNodeProps(vnode);
		while (c && !isOwner && (c = c._parentComponent)) {
			isOwner = c.constructor === vnode.nodeName;
		}

		if (c && isOwner && (!mountAll || c._component)) {
			setComponentProps(c, props, ASYNC_RENDER, context, mountAll);
			dom = c.base;
		} else {
			if (originalComponent && !isDirectOwner) {
				unmountComponent(originalComponent);
				dom = oldDom = null;
			}

			c = createComponent(vnode.nodeName, props, context);
			if (dom && !c.nextBase) {
				c.nextBase = dom;
				// passing dom/oldDom as nextBase will recycle it if unused, so bypass recycling on L229:
				oldDom = null;
			}
			setComponentProps(c, props, SYNC_RENDER, context, mountAll);
			dom = c.base;

			if (oldDom && dom !== oldDom) {
				oldDom._component = null;
				recollectNodeTree(oldDom, false);
			}
		}

		return dom;
	}

	/** Remove a component from the DOM and recycle it.
	 *	@param {Component} component	The Component instance to unmount
	 *	@private
	 */
	function unmountComponent(component) {
		if (options.beforeUnmount) options.beforeUnmount(component);

		var base = component.base;

		component._disable = true;

		if (component.componentWillUnmount) component.componentWillUnmount();
		if (component.uninstall) component.uninstall();

		component.base = null;

		// recursively tear down & recollect high-order component children:
		var inner = component._component;
		if (inner) {
			unmountComponent(inner);
		} else if (base) {
			if (base[ATTR_KEY] && base[ATTR_KEY].ref) base[ATTR_KEY].ref(null);

			component.nextBase = base;

			removeNode(base);
			collectComponent(component);

			removeChildren(base);
		}

		if (component.__ref) component.__ref(null);
	}

	var id = 0;
	function getId() {
		return id++;
	}
	/** Base Component class.
	 *	Provides `setState()` and `forceUpdate()`, which trigger rendering.
	 *	@public
	 *
	 *	@example
	 *	class MyFoo extends Component {
	 *		render(props, state) {
	 *			return <div />;
	 *		}
	 *	}
	 */
	function Component(props, context) {
		this._dirty = true;

		/** @public
	  *	@type {object}
	  */
		this.context = context;

		/** @public
	  *	@type {object}
	  */
		this.props = props;

		/** @public
	  *	@type {object}
	  */
		this.state = this.state || {};

		this._id = getId();

		this._preStyle = null;

		this.$store = null;
	}

	extend(Component.prototype, {

		/** Returns a `boolean` indicating if the component should re-render when receiving the given `props` and `state`.
	  *	@param {object} nextProps
	  *	@param {object} nextState
	  *	@param {object} nextContext
	  *	@returns {Boolean} should the component re-render
	  *	@name shouldComponentUpdate
	  *	@function
	  */

		/** Update component state by copying properties from `state` to `this.state`.
	  *	@param {object} state		A hash of state properties to update with new values
	  *	@param {function} callback	A function to be called once component state is updated
	  */
		setState: function setState(state, callback) {
			var s = this.state;
			if (!this.prevState) this.prevState = extend({}, s);
			extend(s, typeof state === 'function' ? state(s, this.props) : state);
			if (callback) (this._renderCallbacks = this._renderCallbacks || []).push(callback);
			enqueueRender(this);
		},


		/** Immediately perform a synchronous re-render of the component.
	  *	@param {function} callback		A function to be called after component is re-rendered.
	  *	@private
	  */
		forceUpdate: function forceUpdate(callback) {
			if (callback) (this._renderCallbacks = this._renderCallbacks || []).push(callback);
			renderComponent(this, FORCE_RENDER);
		},
		update: function update(callback) {
			this.forceUpdate(callback);
		},


		/** Accepts `props` and `state`, and returns a new Virtual DOM tree to build.
	  *	Virtual DOM is generally constructed via [JSX](http://jasonformat.com/wtf-is-jsx).
	  *	@param {object} props		Props (eg: JSX attributes) received from parent element/component
	  *	@param {object} state		The component's current state
	  *	@param {object} context		Context object (if a parent component has provided context)
	  *	@returns VNode
	  */
		render: function render() {}
	});

	/** Render JSX into a `parent` Element.
	 *	@param {VNode} vnode		A (JSX) VNode to render
	 *	@param {Element} parent		DOM element to render into
	 *	@param {Element} [merge]	Attempt to re-use an existing DOM tree rooted at `merge`
	 *	@public
	 *
	 *	@example
	 *	// render a div into <body>:
	 *	render(<div id="hello">hello!</div>, document.body);
	 *
	 *	@example
	 *	// render a "Thing" component into #foo:
	 *	const Thing = ({ name }) => <span>{ name }</span>;
	 *	render(<Thing name="one" />, document.querySelector('#foo'));
	 */

	function isElement(obj) {
		try {
			//Using W3 DOM2 (works for FF, Opera and Chrome)
			return obj instanceof HTMLElement;
		} catch (e) {
			//Browsers not supporting W3 DOM2 don't have HTMLElement and
			//an exception is thrown and we end up here. Testing some
			//properties that all elements have (works on IE7)
			return typeof obj === "object" && obj.nodeType === 1 && typeof obj.style === "object" && typeof obj.ownerDocument === "object";
		}
	}

	function render(vnode, parent, merge) {
		parent = typeof parent === 'string' ? document.querySelector(parent) : parent;
		var m = isElement(merge) || !merge;
		if (vnode instanceof Component) {
			if (window && window.Omi) {
				window.Omi.instances.push(vnode);
			}
			if (vnode.componentWillMount) vnode.componentWillMount();
			if (vnode.install) vnode.install();
			if (m) {
				vnode.base = diff(merge, vnode.render(), {}, false, parent, false);
			} else {
				vnode.$store = options.$store = merge;
				vnode.base = diff(undefined, vnode.render(), {}, false, parent, false);
			}
			if (vnode.componentDidMount) vnode.componentDidMount();
			if (vnode.installed) vnode.installed();
			return vnode.base;
		}

		return diff(merge, vnode, {}, false, parent, false);
	}

	var instances = [];
	if (typeof window === "object") {
		window.Omi = window.Omi || {
			h: h,
			createElement: h,
			cloneElement: cloneElement,
			Component: Component,
			render: render,
			rerender: rerender,
			options: options,
			instances: instances
		};
	}

	function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

	function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

	function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

	var OmiTap = function (_Component) {
		_inherits(OmiTap, _Component);

		function OmiTap() {
			_classCallCheck(this, OmiTap);

			var _this = _possibleConstructorReturn(this, _Component.call(this));

			_this._handleTouchStart = _this._handleTouchStart.bind(_this);

			_this._handleTouchEnd = _this._handleTouchEnd.bind(_this);
			_this.x = null;
			_this.y = null;
			_this.scrollTop = null;
			return _this;
		}

		OmiTap.prototype._handleTouchStart = function _handleTouchStart(evt) {
			this.x = evt.touches[0].pageX;
			this.y = evt.touches[0].pageY;
			this.scrollTop = document.body.scrollTop;
		};

		OmiTap.prototype._emitEvent = function _emitEvent(name) {
			if (this.props[name]) {
				var _props;

				for (var _len = arguments.length, arg = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
					arg[_key - 1] = arguments[_key];
				}

				(_props = this.props)[name].apply(_props, arg);
			}
		};

		OmiTap.prototype._handleTouchEnd = function _handleTouchEnd(evt) {
			if (Math.abs(evt.changedTouches[0].pageX - this.x) < 30 && Math.abs(evt.changedTouches[0].pageY - this.y) < 30 && Math.abs(document.body.scrollTop - this.scrollTop) < 30) {
				this._emitEvent('onTap', evt);
			}
		};

		OmiTap.prototype.render = function render$$1() {

			return cloneElement(this.props.children[0], {
				onTouchStart: this._handleTouchStart,
				onTouchEnd: this._handleTouchEnd
			});
		};

		return OmiTap;
	}(Component);

	function _classCallCheck$1(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

	function _possibleConstructorReturn$1(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

	function _inherits$1(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

	var TapExample = function (_Component) {
	  _inherits$1(TapExample, _Component);

	  function TapExample() {
	    _classCallCheck$1(this, TapExample);

	    var _this = _possibleConstructorReturn$1(this, _Component.call(this));

	    _this.tapState = 'tap me';
	    _this.tapHandler = _this.tapHandler.bind(_this);
	    return _this;
	  }

	  TapExample.prototype.tapHandler = function tapHandler(evt) {
	    console.log(evt);
	    this.tapState = 'taped';
	    this.update();
	  };

	  TapExample.prototype.style = function style() {
	    return '\n    .tapDiv{\n      width: 100px;\n      height: 100px;\n      background-color: rgb(56,121,217);\n      text-align: center;\n      color: white;\n      margin: 0 auto;\n      line-height: 93px;\n    }\n    ';
	  };

	  TapExample.prototype.render = function render$$1() {
	    return Omi.h(
	      'div',
	      null,
	      Omi.h(
	        'h3',
	        null,
	        'Hello OmiTap'
	      ),
	      Omi.h(
	        OmiTap,
	        { onTap: this.tapHandler },
	        Omi.h(
	          'div',
	          { 'class': 'tapDiv' },
	          this.tapState
	        )
	      )
	    );
	  };

	  return TapExample;
	}(Component);

	render(Omi.h(TapExample, null), 'body');

}());
//# sourceMappingURL=b.js.map
