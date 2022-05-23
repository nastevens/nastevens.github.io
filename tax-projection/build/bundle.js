
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.48.0' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* src/App.svelte generated by Svelte v3.48.0 */

    const file = "src/App.svelte";

    function create_fragment(ctx) {
    	let main;
    	let label0;
    	let t0;
    	let input0;
    	let t1;
    	let fieldset;
    	let label1;
    	let input1;
    	let t2;
    	let t3;
    	let label2;
    	let input2;
    	let t4;
    	let t5;
    	let label3;
    	let input3;
    	let t6;
    	let t7;
    	let label4;
    	let input4;
    	let t8;
    	let t9;
    	let hr;
    	let t10;
    	let div;
    	let label5;
    	let span;
    	let t12;
    	let output;
    	let t13;
    	let t14_value = /*calculate*/ ctx[2](/*value*/ ctx[0], /*method*/ ctx[1]).toLocaleString('en') + "";
    	let t14;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			main = element("main");
    			label0 = element("label");
    			t0 = text("Income:\n        ");
    			input0 = element("input");
    			t1 = space();
    			fieldset = element("fieldset");
    			label1 = element("label");
    			input1 = element("input");
    			t2 = text("\n            MFJ");
    			t3 = space();
    			label2 = element("label");
    			input2 = element("input");
    			t4 = text("\n            Single");
    			t5 = space();
    			label3 = element("label");
    			input3 = element("input");
    			t6 = text("\n            HOH");
    			t7 = space();
    			label4 = element("label");
    			input4 = element("input");
    			t8 = text("\n            MFS");
    			t9 = space();
    			hr = element("hr");
    			t10 = space();
    			div = element("div");
    			label5 = element("label");
    			span = element("span");
    			span.textContent = "Result:";
    			t12 = space();
    			output = element("output");
    			t13 = text("$");
    			t14 = text(t14_value);
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "id", "income");
    			attr_dev(input0, "name", "income");
    			add_location(input0, file, 46, 8, 1147);
    			add_location(label0, file, 44, 4, 1115);
    			attr_dev(input1, "type", "radio");
    			attr_dev(input1, "name", "method");
    			input1.__value = "mfj";
    			input1.value = input1.__value;
    			attr_dev(input1, "class", "svelte-1prg7ke");
    			/*$$binding_groups*/ ctx[5][0].push(input1);
    			add_location(input1, file, 50, 12, 1289);
    			attr_dev(label1, "class", "fieldgroup svelte-1prg7ke");
    			add_location(label1, file, 49, 8, 1250);
    			attr_dev(input2, "type", "radio");
    			attr_dev(input2, "name", "method");
    			input2.__value = "single";
    			input2.value = input2.__value;
    			attr_dev(input2, "class", "svelte-1prg7ke");
    			/*$$binding_groups*/ ctx[5][0].push(input2);
    			add_location(input2, file, 54, 12, 1436);
    			attr_dev(label2, "class", "fieldgroup svelte-1prg7ke");
    			add_location(label2, file, 53, 8, 1397);
    			attr_dev(input3, "type", "radio");
    			attr_dev(input3, "name", "method");
    			input3.__value = "hoh";
    			input3.value = input3.__value;
    			attr_dev(input3, "class", "svelte-1prg7ke");
    			/*$$binding_groups*/ ctx[5][0].push(input3);
    			add_location(input3, file, 58, 12, 1589);
    			attr_dev(label3, "class", "fieldgroup svelte-1prg7ke");
    			add_location(label3, file, 57, 8, 1550);
    			attr_dev(input4, "type", "radio");
    			attr_dev(input4, "name", "method");
    			input4.__value = "mfs";
    			input4.value = input4.__value;
    			attr_dev(input4, "class", "svelte-1prg7ke");
    			/*$$binding_groups*/ ctx[5][0].push(input4);
    			add_location(input4, file, 62, 12, 1736);
    			attr_dev(label4, "class", "fieldgroup svelte-1prg7ke");
    			add_location(label4, file, 61, 8, 1697);
    			attr_dev(fieldset, "class", "svelte-1prg7ke");
    			add_location(fieldset, file, 48, 4, 1231);
    			add_location(hr, file, 66, 4, 1856);
    			attr_dev(span, "class", "result svelte-1prg7ke");
    			add_location(span, file, 68, 11, 1897);
    			attr_dev(output, "name", "result");
    			attr_dev(output, "for", "income");
    			add_location(output, file, 69, 8, 1941);
    			add_location(label5, file, 68, 4, 1890);
    			attr_dev(div, "class", "bigger svelte-1prg7ke");
    			add_location(div, file, 67, 4, 1865);
    			attr_dev(main, "class", "svelte-1prg7ke");
    			add_location(main, file, 43, 0, 1104);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, label0);
    			append_dev(label0, t0);
    			append_dev(label0, input0);
    			set_input_value(input0, /*value*/ ctx[0]);
    			append_dev(main, t1);
    			append_dev(main, fieldset);
    			append_dev(fieldset, label1);
    			append_dev(label1, input1);
    			input1.checked = input1.__value === /*method*/ ctx[1];
    			append_dev(label1, t2);
    			append_dev(fieldset, t3);
    			append_dev(fieldset, label2);
    			append_dev(label2, input2);
    			input2.checked = input2.__value === /*method*/ ctx[1];
    			append_dev(label2, t4);
    			append_dev(fieldset, t5);
    			append_dev(fieldset, label3);
    			append_dev(label3, input3);
    			input3.checked = input3.__value === /*method*/ ctx[1];
    			append_dev(label3, t6);
    			append_dev(fieldset, t7);
    			append_dev(fieldset, label4);
    			append_dev(label4, input4);
    			input4.checked = input4.__value === /*method*/ ctx[1];
    			append_dev(label4, t8);
    			append_dev(main, t9);
    			append_dev(main, hr);
    			append_dev(main, t10);
    			append_dev(main, div);
    			append_dev(div, label5);
    			append_dev(label5, span);
    			append_dev(label5, t12);
    			append_dev(label5, output);
    			append_dev(output, t13);
    			append_dev(output, t14);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input0, "input", /*input0_input_handler*/ ctx[3]),
    					listen_dev(input1, "change", /*input1_change_handler*/ ctx[4]),
    					listen_dev(input2, "change", /*input2_change_handler*/ ctx[6]),
    					listen_dev(input3, "change", /*input3_change_handler*/ ctx[7]),
    					listen_dev(input4, "change", /*input4_change_handler*/ ctx[8])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*value*/ 1 && input0.value !== /*value*/ ctx[0]) {
    				set_input_value(input0, /*value*/ ctx[0]);
    			}

    			if (dirty & /*method*/ 2) {
    				input1.checked = input1.__value === /*method*/ ctx[1];
    			}

    			if (dirty & /*method*/ 2) {
    				input2.checked = input2.__value === /*method*/ ctx[1];
    			}

    			if (dirty & /*method*/ 2) {
    				input3.checked = input3.__value === /*method*/ ctx[1];
    			}

    			if (dirty & /*method*/ 2) {
    				input4.checked = input4.__value === /*method*/ ctx[1];
    			}

    			if (dirty & /*value, method*/ 3 && t14_value !== (t14_value = /*calculate*/ ctx[2](/*value*/ ctx[0], /*method*/ ctx[1]).toLocaleString('en') + "")) set_data_dev(t14, t14_value);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			/*$$binding_groups*/ ctx[5][0].splice(/*$$binding_groups*/ ctx[5][0].indexOf(input1), 1);
    			/*$$binding_groups*/ ctx[5][0].splice(/*$$binding_groups*/ ctx[5][0].indexOf(input2), 1);
    			/*$$binding_groups*/ ctx[5][0].splice(/*$$binding_groups*/ ctx[5][0].indexOf(input3), 1);
    			/*$$binding_groups*/ ctx[5][0].splice(/*$$binding_groups*/ ctx[5][0].indexOf(input4), 1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);

    	let brackets = {
    		"mfj": [
    			[19750.00, 0.10, 0.00],
    			[80250.00, 0.12, 395.00],
    			[171050.00, 0.22, 8420.00],
    			[326600.00, 0.24, 11841.00],
    			[414700.00, 0.32, 37969.00],
    			[622050.00, 0.35, 50410.00],
    			[Infinity, 0.37, 62851.00]
    		],
    		"single": [
    			[9875.00, 0.10, 0.00],
    			[40125.00, 0.12, 197.50],
    			[85525.00, 0.22, 4210.00],
    			[163300.00, 0.24, 5920.50],
    			[207350.00, 0.32, 18984.50],
    			[518400.00, 0.35, 25205.00],
    			[Infinity, 0.37, 35573.00]
    		],
    		"hoh": [[Infinity, 1.00, 0.00]],
    		"mfs": [[Infinity, 1.00, 0.00]]
    	};

    	let value;
    	let method = "mfj";

    	let calculate = (value, method) => {
    		let coerced = +value >= 0 ? value : 0;

    		for (let [max, rate, adj] of brackets[method]) {
    			if (coerced < max) {
    				return coerced * rate - adj;
    			}
    		}

    		return 0;
    	};

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	const $$binding_groups = [[]];

    	function input0_input_handler() {
    		value = this.value;
    		$$invalidate(0, value);
    	}

    	function input1_change_handler() {
    		method = this.__value;
    		$$invalidate(1, method);
    	}

    	function input2_change_handler() {
    		method = this.__value;
    		$$invalidate(1, method);
    	}

    	function input3_change_handler() {
    		method = this.__value;
    		$$invalidate(1, method);
    	}

    	function input4_change_handler() {
    		method = this.__value;
    		$$invalidate(1, method);
    	}

    	$$self.$capture_state = () => ({ brackets, value, method, calculate });

    	$$self.$inject_state = $$props => {
    		if ('brackets' in $$props) brackets = $$props.brackets;
    		if ('value' in $$props) $$invalidate(0, value = $$props.value);
    		if ('method' in $$props) $$invalidate(1, method = $$props.method);
    		if ('calculate' in $$props) $$invalidate(2, calculate = $$props.calculate);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		value,
    		method,
    		calculate,
    		input0_input_handler,
    		input1_change_handler,
    		$$binding_groups,
    		input2_change_handler,
    		input3_change_handler,
    		input4_change_handler
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
        target: document.body,
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
