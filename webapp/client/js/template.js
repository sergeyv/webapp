
(function ($, webapp) {
    "use strict";

    // Add view to the webapp.

    function Template(options) {

        /* options are:
        -identifier
        - rest_service_root
        - data_format
        - after_data_loaded (function)
        - need_load_data
        */
        var opts = $.extend({
            need_load_data: true
        }, options);
        webapp.View.apply(this, [opts]);
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
        return webapp.templates_prefix + this.options.identifier + ".html";
    };

    Template.prototype._get_ajax_calls = function () {
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
                    cache: false
                }));
        } else {
            calls.push(null);
        }

        if (self.options.need_load_data) {
            calls.push($.ajax({
                    type: "GET",
                    url: self.getRestUrl("with-params"),
                    cache: false
                }));
        } else {
            calls.push(null);
        }
        return $.when.apply(null, calls);
    };

    Template.prototype._ajax_finished = function (template_xhr,  data_xhr) {

        var self = this;
        /// template_xhr may be null in case it's not the first time
        /// we're invoking this view (templates are loaded once
        /// and then cached)
        if (template_xhr) {
            self.template = template_xhr[0];
        }

        /// data_xhr may be null if need_load_data is false
        self.data = data_xhr?data_xhr[0]:{};
        self.render();

        /// wait for each partial to finish loading and render it
        $.each(self.options.partials || [], function (partial_name, partial) {
            partial.deferred.done(function (template_xhr,  data_xhr) {
                partial.view = self.view.find('.partial[data-partial="' + partial_name + '"]');
                partial._ajax_finished(template_xhr,  data_xhr);
            });
        });

        if (!self.options.is_partial) {
            // Show the view.
            webapp.log("Set active view!");
            webapp.controller.setActiveView(self);
        } else {
            self.view.removeClass("loading");
        }
    }

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
            ajax_calls;

        /// make sure we initiate template/json loading before we
        /// start loading the partials
        ajax_calls = self._get_ajax_calls();

        if (self.options.partials) {
            $.each(self.options.partials, function (idx, partial) {
                partial.event = self.event;
                partial.deferred = partial._get_ajax_calls();
            });
        }

        ajax_calls.done(function (template_xhr,  data_xhr) {
            self._ajax_finished(template_xhr,  data_xhr);
        });
    };



    /*Template.prototype.showView = function (container) {

        var self = this,
            node_id = self.options.identifier + '-view',
            $node;

        if (!container) {
            /// find or create the view container
            self.view = $("#" + node_id);
            if (!self.view.length) {
                /// Create and append a node if not found
                $node = ($('<div id="' + node_id + '" class="contentView">'));

                $("#content-views").append($node);
                self.view = $("#" + node_id);
            }
        } else {
            self.view = container;
            self.data = data;
            self.render();
        }

        this.reload();
    };*/

    /*Template.prototype.reload = function () {
        var self = this;

        //this.parameters = parameters;
        if (self.options.need_load_data) {
            webapp.log("reading " + self.getRestUrl("with-params"));

            /// when a request is already active we need to abort the previous
            /// request first because chances are the old request will take
            /// longer than the new one, so the view will be re-rendered with
            /// the old data. This primarily manifests with incremental search
            if (self.current_request) {
                self.current_request.abort();
            }

            self.current_request = webapp.Read(self.getRestUrl("with-params"), function (data) {

                self.data = data;
                self.render();
                delete self.current_request;
            });
        } else {
            self.data = {};
            self.render();
        }

        if (!self.options.is_partial) {
            // Show the view.
            webapp.log("Set active view!");
            webapp.controller.setActiveView(self);
        } else {
            self.view.removeClass("loading");
        }

    };*/

    Template.prototype.render = function () {
        var self = this,
            txt,
            q = [];

        if (!self.template) {
            alert("Template not found!");
        }


        try {
            self.view.html($.jqote(self.template, {data: self.data, view: self}));
        } catch (err) {
            //alert(self.template.html());
            alert(err.message);
            if (!webapp.testmode) {
                txt = "There was an error on this page.<br />"
                    + "Error description: <strong>"
                    + err.message + "</strong>";
                webapp.showMessage(txt, "Template error: " + err.name);
            }
        }

        self.augmentView();

        // TODO: Move somewhere - webapp does not need to know
        // about jquery.timeago at all.
        $("abbr.timeago").timeago();
        $.timeago.settings.allowFuture = true;

        if (self.options.after_data_loaded) {
            self.options.after_data_loaded(self);
        }


        if (self.data.stats && $("#stats-view").length) {
            $("#stats-query-count").text(self.data.stats.query_count);
            $("#stats-time-elapsed").text(self.data.stats.time_elapsed * 1000);
            $("#stats-total-time").text(self.data.stats.total_time * 1000);
            $.each(self.data.stats.queries || [], function (idx, val) {
                q.push('<li>' + val[0] + '<strong> &mdash; ' + val[1] + '</strong></li>');
            });
            $("#stats-queries").html('<ol>' + q.join('\n') + '</ol>');
        }

    };


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
    Template.prototype.augmentView = function () {

        var self = this,
            invoke_async_action = function ($link) {
                var meth = webapp.Read,
                    need_send_data = false,
                    callback = function () {

                        $link.addClass("asyncTaskSent");

                        /// find all classes which start with webappOnSuccess
                        /// if found, it expects it to be in a form webappOnSuccess-methodName.
                        /// If the view has such method, it is invoked when the call succeeds
                        $($link.attr('class').split(' ')).each(function (idx, val) {
                            var parts = val.split('-');
                            if (parts.length === 2 &&
                                    parts[0] === "webappOnSuccess" &&
                                    self[parts[1]]) {
                                self[parts[1]]();
                            }
                        });
                    },
                    data = {};

                if ($link.hasClass("webappMethodDelete")) {
                    meth = webapp.Delete;
                    need_send_data = false;
                } else if ($link.hasClass("webappMethodPut")) {
                    meth = webapp.Update;
                    need_send_data = true;
                } else if ($link.hasClass("webappMethodPost")) {
                    meth = webapp.Create;
                    need_send_data = true;
                }


                if ($link.hasClass('webappSendData')) {
                    data = $link.data('send') || {};

                    $.extend(data, (function () {
                        var meth_name = $link.data("collect-method");
                        if (self[meth_name]) {
                            return self[meth_name]();
                        }
                        return {};
                    }()));

                    /// if there's a class webappCollectDataMethod-methodName
                    /// we will extend `data` with what methodName returns
                    //$.each($link.attr('class').split(' '), function (idx, val) {
                    //    var parts = val.split('-');
                        /*if (parts.length === 2 &&
                                parts[0] === "webappCollectDataMethod" &&
                                self[parts[1]]) {
                            $.extend(data, self[parts[1]]());
                        }*/
                    //});

                }

                /// the signatures of webapp.Read and webapp.Delete
                /// require 2 parameters - url and callback, while
                /// webapp.Create and webapp.Update also accept `data`
                /// parameter which unfortunately is in the middle
                /// we may need to refactor this because it's kinda ugly
                if (need_send_data) {
                    meth($link.attr('href'), data, callback);
                } else {
                    meth($link.attr('href'), callback);
                }

                if ($link.hasClass("webappGoBack")) {
                    webapp.relocateTo(webapp.previousPageUrl());
                }
                return false;
            };

        /// Every link marked with webappAsyncAction class will
        /// invoke an async task (well, it can be used to ping
        /// any URL, but the result is discarded, so it's only
        /// useful for async tasks
        self.view.find("a.webappAsyncAction").click(function () {
            var $link = $(this);
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
                            invoke_async_action($link);
                            $(this).dialog('close');
                        }
                    }

                });

            } else {
                /// if there's no webappConfirmDialog class then
                /// we invoke the method directly
                invoke_async_action($link);
            }
            return false;
        });
        /// Every link marked with webappInvokeOnLoad class will
        /// be 'clicked' programmatically when the view is loaded
        /// (in the same manner webappAsyncAction links are invoked when clicked). You can hide the link using css if it should not be displayed in the UI
        self.view.find("a.webappInvokeOnLoad").each(function (idx, elem) {
            var $link = $(elem);
            invoke_async_action($link);
            return undefined; // if we return false the iteration stops
        });

        self.view.find("a.webappPopup").click(function () {

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
                context = webapp.getEventContextForRoute(hash);


            context.popup_success_callback = function (added_id) {
                /// find all classes which start with webappOnSuccess
                /// if found, it expects it to be in a form
                /// webappOnSuccess-methodName.
                /// If the view has such method,
                /// it is invoked when the call succeeds
                $($link.attr('class').split(' ')).each(function (idx, val) {
                    var parts = val.split('-');
                    if (parts.length === 2 &&
                            parts[0] === "webappOnSuccess" &&
                            self[parts[1]]) {
                        self[parts[1]]();
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

        //self.initPartials();
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
                    webapp.log("NOT FOUND: " + id);
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

    webapp.Template = Template;

}(jQuery, webapp));
