
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

        - use_cache - whether we want to use app-wide caching
        - invalidated_by - an array of "types" which may invalidate the current cache
            This is basically a list of items which are directly or indirectly displayed on this page

        */
        var opts = $.extend({
            need_load_data: true,
            aux_templates: [],
            flash_messages_container_id: "#flash_messages",
            use_cache: true,
            invalidated_by: ['*']
        }, options);
        webapp.View.apply(this, [opts]);

        if (this.options.template_name) {
            this.options.uses_custom_template = true;
        }

        if (this.options.data_format) {
            this.options.uses_custom_data_format = true;
        }

        this.options.template_name = this.options.template_name || this.options.identifier;
        this.options.data_format = this.options.data_format || this.options.identifier;
    }

    Template.prototype = new webapp.View();
    /// see http://phrogz.net/js/classes/OOPinJS.html for details
    Template.prototype.constructor = Template;

    Template.prototype.init = function () {
        /*
         this is called once when the view is first shown
         */
        var self = this;

        /*if (self.options.partials) {
            $.each(self.options.partials, function (idx, partial) {
                partial.options.is_partial = true;
                partial.parentView = self;
            });
        }*/

        self.alreadyInitialized = true;

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
                cache: false /* do not cache templates */
            }));

        } else {
            calls.push(null);
        }

        if (self.options.need_load_data) {
            calls.push(
                webapp.get_cached_ajax(
                    self.options.use_cache,
                    self.options.invalidated_by,
                    {
                        type: "GET",
                        url: self.getRestUrl("with-params"),
                        cache: false /* do not cache data using HTTP means */
                    }
                )
            );
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

        /* Initiate partial's ajax calls */
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
            // !NOTE!: These are here as the show method will not be called
            //         on a partial, thus breaking any partials it may have.
            partial.options.is_partial = true;
            partial.parentView = self;

            partial.deferred.done(function () {
                if ( partial.options.render_to )
                {
                    // Partial is set to render to a css selector anywhere
                    // on the current page instead of just a partial placeholder
                    // in the current view
                    partial.view = $( partial.options.render_to );
                }
                else
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
                self.timings.after_view_shown_start = new Date();
                self.options.after_view_shown.apply(self);
                self.timings.after_view_shown_end = new Date();
            }
            if (self.timings) {
                self.log_timings();
            }
        }

        /* if an expandable contains too little text we remove the
        .expandable class and show it as is*/
        $.each(self.view.find('.expandable'), function (idx, elem) {
            var $exp = $(this);
            // the height should be slightly less than 145 px defined in
            if ($exp.height() > 500) {
                $exp.addClass('long');
            } else {
                $exp.find('.read-more').remove();
            }
        });
    };


    Template.prototype.show = function (container) {
        var self = this,
            node_id,
            $node;

        if (!this.alreadyInitialized) {
            this.init();
        }


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
            $node = $('<div id="' + node_id + '" class="contentView"> </div>');

            $("#content-views").append($node);
            self.view = $("#" + node_id);
        }



        this.reload();
    };


    Template.prototype.reload = function () {
        /*
         * Loads JSON data and template (if necessarry)
         * and re-renders the view when they're loaded
         * Returns the deferred used to load the data
         */

        var self = this,
            deferred;

        if (self.options.partials) {
            $.each(self.options.partials, function (idx, partial) {
                partial.parent_is_reloading();
            });
        }

        /// make sure we initiate template/json loading before we
        /// start loading the partials. The deferred may finish immediately
        /// if there's nothing to load (the template has been cached
        /// and there's no data, so we postpone attaching .done() to it until
        /// after we initiated the partials
        deferred = self._initiate_ajax_calls();

        /// now, when partials are happily loading their stuff,
        /// we attach .done() handler to the main deferred
        deferred.done(function () {
            self._ajax_finished.apply(self, arguments);
        });

        return deferred;
    };

    Template.prototype.parent_is_reloading = function () {
        //// TODOXXX: save the DOM node
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
            txt,
            start;

        self.timings = {};

        self.timings.render_start = new Date();

        self.view.html(self.render_data_return_html(self.template, self.data));

        self.timings.render_end = new Date();
        self.augmentView();

        if (self.options.before_view_shown) {
            self.timings.before_view_shown_start = self.timings.render_end;
            self.options.before_view_shown.apply(self, [self.view]);
            self.timings.before_view_shown_end = new Date();
        }
    };


    Template.prototype.augmentView = function () {
        var self = this;
    };


    Template.prototype.log_timings = function () {

        var self = this;

        if (!self.timings) {
            return;
        }


        var msg = "TOO SLOW: " + self.options.identifier,
            render_time = self.timings.render_end - self.timings.render_start,
            bws_time = (self.timings.before_view_shown_end || 0) - (self.timings.before_view_shown_start || 0),
            aws_time = (self.timings.after_view_shown_end || 0) - (self.timings.after_view_shown_start || 0),
            TOO_SLOW = 20,
            total_time = render_time + bws_time + aws_time;

        if (total_time > TOO_SLOW) {
            msg += " shown in " + total_time + "ms: " +
                "(render: " + render_time + "ms; ";
            if (bws_time) {
                msg += "before_view_shown: " + bws_time + "ms; ";
            }

            if (aws_time) {
                msg += "after_view_shown: " + aws_time + "ms; ";
            }

            console.warn(msg);
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

    Template.prototype.renderFlashMessages = function () {
        var self = this,
            msg_container = $(self.options.flash_messages_container_id);//.require_one();


        if(webapp.flash_messages.length > 0) {

            if(webapp.flash_messages[0].type == 'INFO') { // only clear and append if not using pre-rendered flash
                msg_container.children().remove();
                // msg_container.toggleClass('webappHideFlash'); // reset just in case

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

    /* MULTISELECT SUPPORT */
    Template.prototype.get_selected_items = function () {
        return [this.data];
    };
    /* END MULTISELECT SUPPORT */

    webapp.Template = Template;

}(jQuery, webapp));







/* TODO: move it somewhere else */

/*
* Template allows links to have some special classes
* which modify their behaviour:
*
* - webappInvokeOnLoad - the URL will be pinged when the view is shown
*
* - webappConfirm - shows a confirmation dialog, only pings the URL
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

        var selector = "a.webappMethodPut, a.webappMethodPost, a.webappMethodDelete";

        $("body")
            .off("click", selector)
            .on("click", selector, function () {

            var $link = $(this),
                view = webapp.controller.currentView;

            if ( $link.hasClass('disabled') )
                return false;

            /// if the link also has 'webappConfirm' class,
            /// we show a confirmation dialog and only invoke
            // the action if the user clicks OK
            if ($link.hasClass("webappConfirm")) {
                bootbox.dialog($link.data('confirm'), [{
                    "label" : "OK",
                    "class" : "btn-primary",
                    "callback": function() {
                        webapp.invoke_async_action(view, $link);
                    }
                }, {
                    "label" : "Cancel",
                    "class" : "btn-link"
                }]);

            } else {
                /// if there's no webappConfirm class then
                /// we invoke the method directly
                webapp.invoke_async_action(view, $link);
            }
            return false;
        });

        $("body")
            .off("click", ".webappPopup")
            .on("click", ".webappPopup", function () {

            var $link = $(this);

            if ( $link.hasClass('disabled') )
                return false;
            webapp.popupView($link.attr("href"), $link.data('display'), $link, undefined, $link.data('custom_class_body'));
            return false;
        });
    });

}(jQuery, webapp));
