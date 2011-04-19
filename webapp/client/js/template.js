
(function ($, webapp) {

    // Add view to the webapp.

    function Template(options) {

        /* options are:
        -identifier
        - rest_service_root
        - data_format
        - ann
        - after_data_loaded (function)
        */
        this.options = $.extend({
        }, options);
    }

    Template.prototype = new webapp.View();
    /// see http://phrogz.net/js/classes/OOPinJS.html for details
    Template.prototype.constructor = Template;

    Template.prototype.init = function () {
        /// this is called when the view is first shown
        var self = this,
            node_id = self.options.identifier + '-view',
            $node;

        /// find or create the view container
        self.view = $("#" + node_id);
        if (!self.view.length) {
            /// Create and append a node if not found
            $node = ($('<div id="' + node_id + '" class="contentView">'));

            $("#content-views").append($node);
            self.view = $("#" + node_id);
        }

        /// find or create the template container
        node_id = self.options.identifier + '-template';
        self.template = $("#" + node_id);
        if (!self.template.length) {
            /// Create and append a node if not found
            $node = ($('<script type="text/x-jquote-template" id="' + node_id + '">'));

            $("body").append($node);
            self.template = $("#" + node_id);
        }

    };

    Template.prototype.showViewFirstTime = function () {

        var self = this,
            load_from = "/t/" + self.options.identifier + ".html";

        self.init();

        self.template.load(load_from, function () {
            self.showView();
        });
    };

    Template.prototype.showView = function () {

        //this.parameters = parameters;
        this.populateView();
    };

    Template.prototype.populateView = function () {
        var self = this;


        /*  service_url = self.getRestServiceUrl();  ,
        params = [];
        if (self.options.data_format) {
            params.push("format=" + self.options.data_format);
        }
        if (self.options.ann) {
            params.push("ann=1");
        }

        params = params.join("&");
        if (params) {
            service_url = service_url + "?" + params;
        }*/

        $.Read(self.getRestServiceUrl("with-params"), function (data) {
            self.data = data;
            self.renderData();

            // Show the view.
            webapp.controller.setActiveView(self);
        });

    };

    Template.prototype.renderData = function () {
        var self = this,
            txt;

        if (!self.template.length) {
            alert("Template not found!");
        }


        try {
            self.view.html(self.template.jqote({data: self.data, view: self}));
        }
        catch(err) {
            self.view.text(err);
            if (!webapp.testmode) {
                txt="There was an error on this page.<br />";
                txt+="Error description: <strong>" + err.message + "</strong>";
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
        * - webappGoBack - after the async action has been invoked,
        *   redirect to the previous page
        *
        * - webappOnSuccess-<method_name> - invoke a specified method
        *   of the view object after the call succeeds,
        *   i.e. webappOnSuccess-populateView will reload
        *   the data from the server and re-render the template with that data.
        *
        */
    Template.prototype.augmentView = function () {

        var self = this,
            invoke_async_action = function ($link) {
                var meth = $.Read,
                    callback = function () {

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
                    };

                if ($link.hasClass("webappMethodDelete")) {
                    meth = $.Delete;
                }

                if ($link.hasClass("webappMethodPut")) {
                    meth = $.Update;
                }

                meth($link.attr('href'), callback);

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
            load_from = "/forms/" + form_name,
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
