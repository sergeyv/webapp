
(function ($, webapp) {
    "use strict";

    // Add view to the webapp.

    function Template(options) {

        /* options are:
        -identifier
        - rest_service_root
        - data_format
        - template_name
        - need_load_data
        - before_view_shown (function)
        - after_view_shown (function)
        - aux_templates - a list of auxillary templates to be loaded along with the main template
        - rest_params_method - a method which should return an object, key=value pairs from which
                               will be appended to the REST url
        */
        var opts = $.extend({
            need_load_data: true,
            aux_templates: [],
            flash_messages_container_id: "#flash_messages"
        }, options);
        webapp.View.apply(this, [opts]);
        this.options.template_name = this.options.template_name || this.options.identifier;
        this.options.data_format = this.options.data_format || this.options.identifier;
    }

    Template.prototype = new webapp.View();
    /// see http://phrogz.net/js/classes/OOPinJS.html for details
    Template.prototype.constructor = Template;

    Template.prototype.init = function () {
        /// this is called when the view is first shown
        var self = this,
            node_id,
            $node;

        if (self.options.partials) {
            $.each(self.options.partials, function (idx, partial) {
                partial.options.is_partial = true;
                partial.parentView = self;
            });
        }

        /// find or create the view container
        node_id = self.options.identifier + '-view',
        self.view = $("#" + node_id);
        if (!self.view.length) {
            /// Create and append a node if not found
            $node = ($('<div id="' + node_id + '" class="contentView">'));

            $("#content-views").append($node);
            self.view = $("#" + node_id);
        }

    };

    Template.prototype._get_template_load_url = function () {
        return webapp.templates_prefix + this.options.template_name + ".html";
    };

    Template.prototype._initiate_ajax_calls = function () {
        /*
         * Returns a Deferred object which tracks the progress of zero or
         * more AJAX calls to load resources needed to render the view
         * (normally - a template and JSON data)
         * http://api.jquery.com/jQuery.when/
         * http://api.jquery.com/category/deferred-object/
         * http://stackoverflow.com/questions/9633507/jquery-deferred-object-and-ajax-calls
         */
        var self = this,
            calls = [];


        if (!self.template) {
            calls.push($.ajax({
                    url: self._get_template_load_url(),
                    cache: true
                }));
        } else {
            calls.push(null);
        }

        if (self.options.need_load_data) {
            calls.push(
                $.ajax({
                    type: "GET",
                    url: self.getRestUrl("with-params"),
                    cache: true
                }));
        } else {
            calls.push(null);
        }

        /* load auxillary templates */
        if (!self.aux_templates && self.options.aux_templates) {
            $.each(self.options.aux_templates, function (idx, template_name) {
                calls.push(
                    $.ajax({
                        type: "GET",
                        url: webapp.templates_prefix + template_name + ".html",
                        cache: true
                    })
                );
            });
        }

        return $.when.apply(null, calls);
    };

    Template.prototype._ajax_finished = function () {

        var self = this,
            args = arguments,
            template_xhr = args[0],
            data_xhr = args[1];

        /// template_xhr may be null in case it's not the first time
        /// we're invoking this view (templates are loaded once
        /// and then cached)
        if (template_xhr) {
            self.template = template_xhr[0];
        }

        /// data_xhr may be null if need_load_data is false
        self.data = data_xhr?data_xhr[0]:{};

        /* attach auxillary templates - only on the first invocation */
        if (!self.aux_templates && self.options.aux_templates) {
            self.aux_templates = {};
            $.each(self.options.aux_templates, function (idx, template_name) {
                // first two xhrs are view's main template and data; they're guaranteed
                // to be present - if the view does not load a template or data, the
                // arguments will be null
                self.aux_templates[template_name] = args[idx+2][0];
            });
        }

        self.render();

        /// wait for each partial to finish loading and render it
        $.each(self.options.partials || [], function (partial_name, partial) {
            partial.deferred.done(function () {
                partial.view = self.view.find('.partial[data-partial="' + partial_name + '"]');
                partial._ajax_finished.apply(partial, arguments);
            });
        });

        if (!self.options.is_partial) {
            // Show the view.
            webapp.controller.setActiveView(self);
        } else {
            self.view.removeClass("loading");
            if (self.options.after_view_shown) {
                self.options.after_view_shown.apply(self);
            }
        }
    };


    Template.prototype.show = function (container) {
        this.init();
        this.reload();
    };


    Template.prototype.reload = function () {
        /*
         * Loads JSON data and template (if necessarry)
         * and re-renders the view when they're loaded
         */

        var self = this,
            deferred;

        /// make sure we initiate template/json loading before we
        /// start loading the partials. The deferred may finish immediately
        /// if there's nothing to load (the template has been cached
        /// and there's no data, so we postpone attaching .done() to it until
        /// after we initiated the partials
        deferred = self._initiate_ajax_calls();

        if (self.options.partials) {
            $.each(self.options.partials, function (idx, partial) {
                partial.event = self.event;
                /// create a deferred but do not attach .done() to it -
                /// we only want to deal with partials after
                /// the main template is loaded. We do that in
                /// ._ajax_finished() method
                partial.deferred = partial._initiate_ajax_calls();
            });
        }

        /// now, when partials are happily loading their stuff,
        /// we attach .done() handler to the main deferred
        deferred.done(function () {
            self._ajax_finished.apply(self, arguments);
        });
    };


    Template.prototype.update_data = function (data) {
        /*
        updates the data and re-renders the view - useful when some ajax
        call returns (partial) data and we want to refresh the view
        */
        $.extend(this.data, data);
        this.render();
    };

    Template.prototype.render_data_return_html = function (template, data) {
        /*
        renders data using the passed template, return a html blob
        */
        var self = this,
            txt;

        if (!template) {
            return "ERROR: Template not found!";
        }

        try {
            return $.jqote(template, {data: data, view: self});
        } catch (err) {
            if (!webapp.testmode) {
                txt = "There was an error on this page.<br />" +
                      "Error description: <strong>" +
                      err.message + "</strong>";
                /// webapp.showMessage(txt, "Template error: " + err.name);
                return txt;
            }
        }
    };

    Template.prototype.render = function () {
        /*
         * Renders the already-loaded template and data
         */
        var self = this,
            txt;

        self.view.html(self.render_data_return_html(self.template, self.data));

        self.augmentView();

        if (self.options.before_view_shown) {
            self.options.before_view_shown.apply(self, [self.view]);
        }
    };


    Template.prototype.augmentView = function () {

        var self = this;

        /// Every link marked with webappInvokeOnLoad class will
        /// be 'clicked' programmatically when the view is loaded
        /// (in the same manner webappAsyncAction links are invoked when clicked). You can hide the link using css if it should not be displayed in the UI

        /// prevent an infinite loop when a view is reloaded
        /// as a result of an async task succeeding
        if (!self.event.async_message) {
            self.view.find("a.webappInvokeOnLoad").each(function (idx, elem) {
                var $link = $(elem);
                webapp.invoke_async_action(self, $link);
                return undefined; // if we return false the iteration stops
            });
        }
    };


    Template.prototype.fill_form = function (id_root, data) {
        /* Recursively iterate over the json data, find elements
        * of the form and set their values.
        * Now works with subforms
        */
        var self = this,
            elem;
        if (!data) { return; }

        $.each(data, function (name, value) {
            var id = id_root + '-' + name;
            if (typeof value === "string" ||
                    typeof value === "number" ||
                    typeof value === "boolean") {

                elem = $('#' + id);
                if (elem.length) {
                    /// support read-only fields
                    if (elem[0].tagName.toLowerCase() === 'div') {
                        elem.html(value || '&mdash;');
                    } else {
                        elem.val(value);
                        elem.change();
                    }
                } else {
                    console.log("NOT FOUND: " + id);
                }
            } else if (typeof value === "object" && data) {
                self.fill_form(id, data[name]);
            }
        });

    };

    Template.prototype.renderForm = function (form_name, data) {
        /*
        * Loads a loadable form and uses it to render the data.
        * Can be invoked from the template as
        * <%=this.view.renderForm("FormName", this.data); %>
        * (experimental)
        * TODO: The form is currently loaded on every invocation
        * of the function. Should be loaded once
        */
        var self = this,
            load_from = webapp.forms_prefix + form_name,
            id_root = form_name,
            placeholder = '<div id="' + id_root + '">(+here it is!+)</div>';

        $.get(load_from, function (form_html) {
            $('#' + id_root).html(form_html).find('div.actions').remove();
            self.fill_form(id_root, data);
        });

        return placeholder;
    };

    Template.prototype.renderFlashMessages = function () {
        var self = this,
            msg_container = $(self.options.flash_messages_container_id).require_one();


		if(webapp.flash_messages.length > 0) {

			if(webapp.flash_messages[0].type == 'INFO') { // only clear and append if not using pre-rendered flash
        		msg_container.children().remove();
        		msg_container.toggleClass('webappHideFlash'); // reset just in case

        		$.each(webapp.flash_messages, function (idx, msg) {
			        msg_container.append('<div class="alert">' +
			            msg.msg +
			            '</div>'
			            );
		        });
			} else if (webapp.flash_messages[0].type == 'SHOW') { // display pre-rendered flash message for certain templates
           		msg_container.toggleClass('webappHideFlash'); // status message should be set to display: none before
            }

		}

        webapp.flash_messages = [];

    };

    webapp.Template = Template;

}(jQuery, webapp));







/* TODO: move it somewhere else */

/*
* Template allows links to have some special classes
* which modify their behaviour:
*
* - webappAsyncAction - clicking on the link pings the target URL
*   without the page being reloaded. The server response is discarded
*
* - webappInvokeOnLoad - the URL will be pinged when the view is shown
*
* - webappConfirmDialog - shows a confirmation dialog, only pings the URL
*   if the user chooses OK. The link's title tag is used for
*   the dialog's message text
*
* - webappMethodDelete - uses DELETE instead of POST (otherwise it's GET)
*   We can add more methods when needed though it's not yet
*   clear how to send any data in a POST or PUT request.
*
* - webappSendData - sends the data from the link's data-send attribute
*
* - webappCollectDataMethod-<methodName> - invokes a method of the view
*   and extends the data to be sent to the server with whatever the method returns
*
*
* - webappGoBack - after the async action has been invoked,
*   redirect to the previous page
*
* - webappOnSuccess-<method_name> - invoke a specified method
*   of the view object after the call succeeds,
*   i.e. webappOnSuccess-reload will reload
*   the data from the server and re-render the template with that data.
*
* - webappPopup - display the target link in the popup. It is possible to
*   invoke an async action and show the view in a popup at the same time
*   by specifying both urls separated by a hash: /rest/some/url#/some/view
*
*/


(function ($, webapp) {
    "use strict";

    $(function () { // need to run this after <body> is loaded

        /// Every link marked with webappAsyncAction class will
        /// invoke an async task (well, it can be used to ping
        /// any URL, but the result is discarded, so it's only
        /// useful for async tasks
        // self.view.find("a.webappAsyncAction").click(function () {

        $("body")
            .off("click", "a.webappAsyncAction")
            .on("click", "a.webappAsyncAction", function () {

            var $link = $(this),
                view = webapp.controller.currentView;

            /// if the link also has 'webappConfirmDialog' class,
            /// we show a confirmation dialog and only invoke
            // the action if the user clicks OK
            if ($link.hasClass("webappConfirmDialog")) {
                $('<div></div>').text($link.attr('title')).dialog({
                    modal: true,
                    title: "Confirm",
                    buttons: {
                        Cancel: function () {
                            $(this).dialog('close');
                        },
                        OK: function () {
                            webapp.invoke_async_action(view, $link);
                            $(this).dialog('close');
                        }
                    }

                });

            } else {
                /// if there's no webappConfirmDialog class then
                /// we invoke the method directly
                webapp.invoke_async_action(view, $link);
            }
            return false;
        });

        $("body")
            .off("click", "a.webappPopup")
            .on("click", "a.webappPopup", function () {

            var $link = $(this),
                href = (function (l) {
                    /* remove the part of the url before the hash */
                    var parts = l.split('#');
                    if (parts.length === 2) {
                        return "#" + parts[1];
                    }
                    return l;
                }($link.attr("href"))),
                hash = webapp.normalizeHash(href),
                context = webapp.getEventContextForRoute(hash),
                view = webapp.controller.currentView;


            context.popup_success_callback = function (added_id) {
                /// find all classes which start with webappOnSuccess
                /// if found, it expects it to be in a form
                /// webappOnSuccess-methodName.
                /// If the view has such method,
                /// it is invoked when the call succeeds
                $($link.attr('class').split(' ')).each(function (idx, val) {
                    var parts = val.split('-'),
                        fn;
                    if (parts.length === 2 &&
                            parts[0] === "webappOnSuccess" &&
                            view[parts[1]]) {
                        fn = view[parts[1]];
                        fn.apply(view);
                    }
                });
            };

            if (context.mapping) {
                context.mapping.controller.popupView(context.mapping.view, context);
            } else {
                webapp.showMessage("POPUP VIEW NOT FOUND: "  + hash);
            }
            return false;
        });
    });

}(jQuery, webapp));
