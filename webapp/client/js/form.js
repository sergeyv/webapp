(function ($, webapp) {
    "use strict";

    function Form(options) {

        /* Options are:
        identifier
        title
        button_title
        rest_service_root
        submit_action
        next_view
        */
        var opts = $.extend({
            title: "Add/Edit Item",
            button_title: "Save Changes",
            http_method: "PUT",
            need_load_data: true,
            need_save_data: true,
            submit_action: 'redirect'

        }, options);

        webapp.Template.apply(this, [opts]);

        this.options.data_format = this.options.data_format || this.options.identifier;
    }

    Form.prototype = new webapp.Template();
    Form.prototype.constructor = Form;


    Form.prototype.bindFormControls = function () {
        var self = this,
            items;
        self.form = $("#" + self.options.identifier);
        self.controls = {};

        items = self.form.serializeArray();

        $.each(items, function () {
            self.controls[this.name] = $("#" + self.options.identifier + "-" + this.name);
        });
    };

    Form.prototype.setValidationRules = function () {
        var self = this,
            rules = webapp.getValidationRules(self.options.identifier);

        self.form.validate({ rules: rules,
            submitHandler: function () {
                self.submitForm();
            }
            });

    };



    Form.prototype.showViewFirstTime = function () {

        var self = this,
            load_from = webapp.forms_prefix + self.options.identifier;


        self.init();

        // $.get does not process the data, and $(elem).load does some processing
        $.get(load_from, function (data) {
            //
            self.template.text(data);
            self.showView();
        });
    };


    Form.prototype.genericAugmentForm = function () {
        /// Do stuff we want on every form
        var self = this,
            title = self.event.parameters.title || self.options.title,
            button_title = self.event.parameters.button_title || self.options.button_title;

        if (self.options.need_save_data) {
            self.view.find(".actions").append("&nbsp; or &nbsp;<a class=\"formCancelLink\" href=\"#/\">Cancel</a>");
        } else {
            self.view.find(".actions").html("<a class=\"formCancelLink\" href=\"#/\">Close</a>");
        }
        self.cancelLink = self.view.find("a.formCancelLink");

        self.view.find(".webappPopup").click(function () {
            var $link = $(this);
            return webapp.popupView($link.attr('href'), function (server_response) {
                var $select = $link.parent().children("select");
                $select.data("original_value", server_response.item_id);
                self.reloadLoadable($select);
            });

            /*var $link = $(this),
                hash = webapp.normalizeHash($link.attr("href")),
                context = webapp.getEventContextForRoute(hash);


            context.popup_success_callback = function (added_id) {
                //alert("Success: " + added_id);
                var $select = $link.parent().children("select");
                $select.data("original_value", added_id);
                self.reloadLoadable($select);
            };

            if (context.mapping) {
                context.mapping.controller.popupView(context.mapping.view, context);
            } else {
                self.showMessage("POPUP VIEW NOT FOUND: " + hash);
            }
            return false;*/
        });


        if (self.event.is_popup) {
            self.cancelLink.click(function () {
                self.view.dialog('close');
                return false;
            });
        } else {
            self.view.prepend($('<h1 class="primaryPageHeading">' + title + '</h1>'));
            /// TODO: Add option/condition "add_cancel_link"?
            /// Cancel link points to the page we came from
            self.cancelLink.attr('href', webapp.previousPageUrl());
            self.cancelLink.click(function () {});
        }
        self.view.find("#" + self.options.identifier + "-action").val(button_title);

        // Init formish form
        self.view.formish();

        //self.view.find("select").chosen();
    };

    Form.prototype.augmentForm = function () {
        /*
        Modify the form appearance after it is loaded
        */

        /// invoke hooks defined in the application

        var id = this.options.identifier,
            afl = webapp.callbacks.afterFormLoaded;
        if (afl.hasOwnProperty(id)) {
            afl[id](this);
        }

    };

    Form.prototype.setHandlers = function () {
        /*
        Attach form handlers which respond to changes in the form_data
        (i.e. to implement dependent controls etc.)
        */

        /// do nothing, override in subclasses
    };



    Form.prototype.populateView = function () {
        var self = this,
            item_id,
            id_root;


        self.data = {};
        // This renders the template
        self.renderData();

        self.bindFormControls();
        self.populateLoadables();


        self.genericAugmentForm();

        /// Form is loaded, we can now adjust form's look
        self.augmentForm();

        // and bind stuff
        self.bindFormControls();

        self.register_combination_changes();

        if (self.options.need_save_data) {
            // Set validation
            self.setValidationRules();
        }

        // attach event handlers
        self.setHandlers();

        id_root = '#' + self.options.identifier;
        item_id = self.event.parameters.item_id || 'new';

        if (self.options.need_load_data) {
            webapp.Read(self.getRestServiceUrl("with-params", { item_id: item_id }), function (data) {
                self.fill_form(id_root, data);

                // Only show the view after all the data is set.
                webapp.controller.setActiveView(self);
            });
        } else {
            webapp.controller.setActiveView(self);
        }


    };

    // ----------------------------------------------------------------------- //


    // I disable the form.
    Form.prototype.disableForm = function () {
        // Disable the fields.
    };


    // I enable the form.
    Form.prototype.enableForm = function () {
        // Enable the fields.
    };


    Form.prototype.resetForm = function () {
        /*
        * Removes validation messages and resets the form to its initial values
        */
        var self = this,
            validator = self.form.validate();
        if (validator) {
            validator.resetForm();
        } else {
            webapp.log("Validator is NULL for " + self.form);
        }

    };


    Form.prototype.fill_form = function (id_root, data) {
        /* Recursively iterate over the json data, find elements
        * of the form and set their values.
        * Now works with subforms
        */
        var self = this,
            is_array = function (arg) {
                return (arg && typeof arg === 'object' &&
                        typeof arg.length === 'number' &&
                        !(arg.propertyIsEnumerable('length')));
            },
            format_date = function (date_str) {
                /*
                Converts a date parsable by the Date class (i.e. in ISO-whatever format)
                to a 27 Mar 2001 format
                */
                if (webapp.helpers.date) {
                    // webapp.helpers.date overrides this
                    return webapp.helpers.date(date_str);
                }

                if (!date_str) { return ""; }

                var d = new Date(date_str),
                    MONTH_NAMES = [
                        'Jan', 'Feb', 'Mar',
                        'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep',
                        'Oct', 'Nov', 'Dec'
                    ],
                    day = d.getDate();

                if (day < 10) { day = "0" + day; }
                return String(day) + " " + MONTH_NAMES[d.getMonth()] + " " + d.getFullYear();
            };

        if (!data) { return; }

        $.each(data, function (name, value) {

            var id,
                elem,
                display_elem,
                link;

            // The app can provide default values to pre-fill the form
            // by invoking a url in format #/view|key1:value1|key2:value2
            // the defaults would only be applied if the server passes
            // null or undefined as the value - empty strings or bools still
            // take precendence
            if (value === null || typeof value === 'undefined') {
                value = self.event.uri_args[name] || '';
            }

            id = id_root + '-' + name;
            if (typeof value === "string" ||
                    typeof value === "number" ||
                    typeof value === "boolean") {
                elem = $(id);

                if (elem.length) {
                    if (elem.hasClass("calendar")) {
                        /// this is for calendar widget - it allows us to
                        /// display a friendly date (7 Nov 1012)
                        /// while submitting '2012-11-07' to the server
                        display_elem = $(id + "-display");
                        elem.val(value);
                        elem.change();
                        display_elem.val(format_date(value));
                        display_elem.change();
                    } else if (elem[0].tagName.toLowerCase() === 'div') {
                        /// support read-only fields
                        elem.html(value || '&mdash;');
                    } else if (elem.attr('type') === 'checkbox') {
                        /// support checkboxes - set "checked" attribute instead of "value"
                        elem.val('true');
                        if (value) {
                            // see http://stackoverflow.com/questions/426258/how-do-i-check-a-checkbox-with-jquery-or-javascript
                            elem.each(function () {
                                this.checked = true;
                            });
                        }
                        elem.change();
                    } else {
                        elem.val(value);
                        elem.data("original_value", value);
                        elem.change();
                    }
                } else {
                    webapp.log("NOT FOUND: " + id);
                }
            } else if (is_array(value)) {
                /* Support arrays (aka sc.Sequence) subforms -
                * need to delete any fields added during the
                * previous showing of the form
                */
                elem = $(id + '--field');
                link = $(elem.find('a.adderlink'));

                // remove existing fieldsets
                elem.find('.field').remove();
                // remove stuff which is not fields (i.e. separators etc.)
                elem.find('.nonField').remove();

                // should go before the === "object" section
                $.each(value, function (idx, subvalue) {
                    self.view.formish('add_new_items', $(link));
                    self.fill_form(id + '-' + idx, subvalue);
                });
                self.view.formish('add_new_items_header_row', $(link));

            } else if (typeof value === "object") {
                if (data) {
                    self.fill_form(id, value);
                }
            }
        });

    };


    Form.prototype.mangle_url = function (path, $elem) {
        /*
        *  The method takes a URL which contains some placeholders, such as
        *  /providers/:provider_id/datacentres, prepends the form's name to it
        *  and finds a form element which
        *  matches (i.e. with id="ZopeAddForm-provider_id"). Then it replaces
        *  the placeholder with the value of the control.
        *  If the 'master' control's value evaluates to false
        *  (i.e. when it's contents is not loaded) the method returns
        *  an empty string, which indicates that we should not load just now.
        *
        *  The method also adds a change handler to the 'master' control so the
        *  dependent control is refreshed each time master is changed.
        */

        var self = this,
            url = path.replace(
                new RegExp("(/):([^/]+)", "gi"),
                function ($0, $1, $2) {
                    /// here $0 is the whole match,
                    /// $1 is the slash
                    /// $2 is the id of the 'master field'

                    var id = $2,
                        $master_elem = $("#" + id);
                    // we mark the dependent element with a class to
                    // avoid setting the change() handler more than once for
                    // any dependent element
                    if (!$elem.hasClass('dependent')) {
                        $master_elem.change(function () {
                            if ($(this).val()) {
                                self.reloadLoadable($elem);
                            } else {
                                self.hideListbox($elem);
                            }
                        });
                        $elem.addClass('dependent');
                    }

                    /// if the master select has no value, this means it's
                    /// not loaded - anyway, it makes no sense to attempt to
                    /// load from, say, /providers/undefined/hosts, so we inject
                    /// a marker into the URL so later we can say if we need to skip
                    /// loading altogether
                    if ($master_elem.val()) {
                        return $1 + $master_elem.val();
                    } else {
                        return "MASTER_NOT_LOADED";
                    }
                }
            );
        if (url.indexOf("MASTER_NOT_LOADED") === -1) {
            return url;
        } else {
            return "";
        }
    };


    Form.prototype.populateLoadables = function () {

        var self = this;


        self.form.find('div.loadableListbox').each(function () {
            var $select = $(this).find('select');
            self.hideListbox($select);
            self.reloadLoadable($select);
        });

        self.form.find('div.autoFillDropdown').each(function () {
            //var $widget = $(this).find('div.autofillform');
            /*self.autoFillForm($widget);*/
            var $select = $(this).find('select');
            $select.change(function () {
                var item_id = self.event.parameters.item_id || 'new',
                    url = self.getRestServiceUrl("with-params",
                        {
                            item_id: item_id
                        },
                        {
                            only: $select.data('dependent_fields'),
                            set_field: $select.attr('name'),
                            set_value: $select.val()
                        });

                webapp.Read(url, function (data) {
                    var id_root = '#' + self.options.identifier;
                    self.fill_form(id_root, data);
                    // Only show the view after all the data is set.
                    //webapp.controller.setActiveView(self);
                });

            });
        });
    };

    Form.prototype.reloadLoadable = function ($select) {
        var self = this,
            from = self.mangle_url($select.attr("href"), $select);

        /// empty 'from' url signals that we shouldn't attempt to load the data
        /// just yet (i.e. a master listbox was not loaded yet)
        if (from) {
            webapp.Read(from, function (data) {
                $select.children().remove();
                $('<option value="">- choose -</option>').appendTo($select);
                $.each(data.items, function (idx, value) {
                    $("<option/>").val(value[0]).html(value[1]).appendTo($select);
                });

                /// for dependent listboxes, their options are loaded
                /// after the content is loaded, so we need somehow to
                /// set their value after the fact. For this, we store
                /// the original value as "original_value" attribute of every
                /// element. After the listbox has been loaded, we now able
                /// to select the element we need
                $select.val($select.data("original_value"));
                $select.removeData("original_value");
                self.showListbox($select);
                $select.change();
            });
        }
    };


    Form.prototype.hideListbox = function ($select) {
        /* hides a loadable listbox when it's not yet loaded
           or if it's parent is not selected */

        /// need to clear the listbox so any dependent listboxes
        /// are getting hidden too
        $select.val('').change();
        if ($select.data('displaytype') === 'disable') {
            $select.attr('disabled', 'disabled');
            $select.parent().find('.iconAdd').hide(); // hide the add button
        } else {
            $select.parents("div.field").hide();
        }

    };

    Form.prototype.showListbox = function ($select) {
        /// shows a loadable listbox after it's loaded
        /// or if it's parent is selected
        if ($select.data('displaytype') === 'disable') {
            $select.removeAttr('disabled');
            $select.parent().find('.iconAdd').show(); // show the add button

        } else {
            $select.parents("div.field").show();
        }

    };

    Form.prototype.submitForm = function () {
        /*
        * If self.event.parameters.item_id is present, the method
        * PUTs json-serialized form data to the rest url of that item.
        * Otherwise it uses a 'virtual' item called 'new', i.e.
        * /rest/clients/new.
        */
        var self = this,
            form_data = self.form.serializeObject(),
            item_id = self.event.parameters.item_id || 'new',
            meth = webapp.Update;

        if (self.options.http_method === "POST") {
            meth = webapp.Create;
        }

        meth(self.getRestServiceUrl("", {item_id: item_id}), form_data,
            function (data) {

                /*
                    The server is supposed to return {item_id: 123} when
                    an item is created or updated. We update our event parameters
                    with the values returned by the server so any subsequent
                    submits of the form go to the address of the newly-created item
                    (this is possible in case of submit_action="popup")
                */
                if (data ) {
                    $.extend(self.event.parameters, data);
                }

                if (self.event.is_popup) {
                    self.view.dialog("close");
                    if (self.event.popup_success_callback) {
                        self.event.popup_success_callback(self.event.parameters);
                    }
                } else {
                    var url = self.options.next_view;
                    if (url) {
                        url = webapp.fillInPlaceholders(url, self.event.parameters);
                    } else {
                        url = webapp.previousPageUrl();
                    }

                    if (self.options.submit_action === 'redirect') {
                        webapp.relocateTo(url);
                    } else if (self.options.submit_action === 'popup') {
                        webapp.popupView(url);
                    }
                }

            });

        return false;
    };



    Form.prototype.refresh_listbox_vocab = function (url, listbox, addmore) {
        var self = this;
        /// query an id-value list form the server and populate
        /// a listbox
        $.getJSON(url, function (data) {
            self.populate_listbox(listbox, data, addmore);
        });
    };

    Form.prototype.register_combination_changes = function () {
        this.form.find('div.combinationfield').each(function () {
            var field_name = $(this).find('input').attr('id'),
                fields = [],
                cnt = 0;

            $(this).find('div.combination-field').each(function () {
                fields[cnt] = $(this).attr('field');
                cnt += 1;
                $('div.' + $(this).attr('field')).change(function () {
                    var field_input = '',
                        i;
                    for (i = 0; i < cnt; i += 1) {
                        field_input += $('#' + fields[i]).val();
                    }
                    $("input#" + field_name).val(field_input).change();
                });
            });
        });
    };

    webapp.Form = Form;

}(jQuery, webapp));



