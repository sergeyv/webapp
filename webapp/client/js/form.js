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
        auto_fill - normally, a form is rendered first and then fill_form method
            finds the controls and fills them with values from this.data. For
            forms rendered from a custom template we don't need this behaviour
            and in fact it may interfere with the manually set values
        */
        var opts = $.extend({
            title: "Add/Edit Item",
            button_title: "Save Changes",
            http_method: "PUT",
            need_load_data: true,
            submit_action: 'redirect',
            auto_fill: true,
            use_cache: false
        }, options);

        webapp.Template.apply(this, [opts]);
    }

    Form.prototype = new webapp.Template();
    Form.prototype.constructor = Form;


    Form.prototype.bindFormControls = function () {
        var self = this,
            items;
        self.form = $("#" + self.options.identifier).require_one();
        self.controls = {};

        items = self.form.serializeArray();

        $.each(items, function () {
            self.controls[this.name] = $("#" + self.options.identifier + "-" + this.name);
        });
    };


    Form.prototype.setValidationRules = function () {
        var self = this,
            rules = $.extend({}, webapp.getValidationRules(self.options.identifier)); // make a copy


        /// 'remote' rules have only attribute name, we need to turn it into a full url
        $.each(rules, function (field_name, field_rules) {
            $.each(field_rules, function (rule_name, rule_value) {
                var rule;
                if (rule_name == 'remote') {
                    rule_value = rule_value.url || rule_value;
                    rule = {
                        url: self.getRestUrl() + "/v/" + rule_value
                    };

                    /// a form can define a dict of callbacks to be called
                    /// when remote val.idation completes:
                    /// this.on_remote_validation = {
                    ///     user_details.name: function () { alert("hello!") }
                    /// }
                    if (self.on_remote_validation &&
                        self.on_remote_validation[field_name]) {
                            /// it needs to be wrapped in a function() because the callback is being called
                            /// in the wrong context so "this" points to window
                            rule.complete = function () {
                                self.on_remote_validation[field_name]();
                            };
                        }
                    rules[field_name][rule_name] = rule;
                }
            });
        });

        self.form.validate({ rules: rules,
            submitHandler: function () {
                self.submitForm();
            }
            });

    };

    Form.prototype._get_template_load_url = function () {
        /*
        overrides Template's method to load formish-generated html blob
        from a different URL
        */
        if (this.options.uses_custom_template) {
            return webapp.templates_prefix + this.options.template_name + ".html";
        } else {
            return  webapp.forms_prefix + this.options.identifier;
        }
    };


    Form.prototype.genericAugmentView = function () {
        /// Do stuff we want on every form
        var self = this,
            title,
            button_title = self.event.parameters.button_title || self.options.button_title;

        self.view.find(".actions").append('&nbsp; or<button type="button" class="btn btn-link formCancelLink">Cancel</button>');

        self.cancelLink = self.view.find(".formCancelLink");

        title = self.get_title();
        if (title) {
            // raw modals do not need a title prepended
            if (!self.view.find('.rawModal').length) {
                self.view.prepend($('<h1 class="primaryPageHeading">' + title + '</h1>'));
            }
        }

        /*self.cancelLink.on('click', function () {
            /// close existing open popovers
            $('[data-instant_popover-open=1]').each(function () {
                if ($(this).data('instant_popover')) $(this).data('instant_popover').do_dismiss();
            });
        });*/


        /* TODO: this is supposed to reload the listbox when the popup is
         submitted. This does not currently work.

         Fix. */


        /*self.view.find(".webappPopup").click(function () {
            var $link = $(this);
            return webapp.popupView($link.attr('href'), "modal", function (server_response) {
                var $select = $link.parent().children("select");
                $select.data("original_value", server_response.item_id);
                self.reloadLoadable($select);
            });
        });*/


        if (self.event.display_mode === "popup") {
            self.cancelLink.click(function () {
                self.view.dialog('close');
                return false;
            });
        } else if (self.event.display_mode === "modal") {
            self.cancelLink.attr('data-dismiss', 'modal');
        } else if (self.event.display_mode === "popover") {
            //self.cancelLink.attr('data-dismiss', 'instant_popover');
            self.cancelLink.on('click.formCancelLink', function () {
                /// close existing open popovers
                $('[data-instant_popover-open=1]').each(function () {
                    if ($(this).data('instant_popover')) $(this).data('instant_popover').do_dismiss();
                });
                $('body').off('click.formCancelLink', ".formCancelLink");
            });
        } else if (self.event.display_mode === "inline") {
            //self.cancelLink.attr('data-dismiss', 'instant_popover');
            self.cancelLink.on('click.formCancelLink', function () {
                // do whatever the parent view wanst us to do on success
                self.dismiss();
                if (self.event.popup_success_callback) {
                    self.event.popup_success_callback(self.event.parameters);
                }
                $('body').off('click.formCancelLink', ".formCancelLink");
                return false; // stops it from submitting the form
            });
        } else if (!self.event.display_mode) {

            /// Cancel link points to the page we came from
            self.cancelLink.attr('href', webapp.previousPageUrl());
            self.cancelLink.click(function () {});
        }
        self.view.find("#" + self.options.identifier + "-action").val(button_title).addClass('btn btn-primary');


    };

    Form.prototype.augmentView = function () {
        /*
        Modify the form appearance after it is loaded
        */

    };


    // Form.prototype.render_data_return_html = function (template, data) {
    //     /*
    //     renders data using the passed template, return a html blob
    //     */
    //     var self = this,
    //         txt;

    //     if (!template) {
    //         return "ERROR: Template not found!";
    //     }

    //     try {
    //         return $.jqote(template, {data: data, view: self});
    //     } catch (err) {
    //         alert(err.message);
    //         if (!webapp.testmode) {
    //             txt = "There was an error on this page.<br />"
    //                 + "Error description: <strong>"
    //                 + err.message + "</strong>";
    //             webapp.showMessage(txt, "Template error: " + err.name);
    //         }
    //     }
    // };


    Form.prototype.render = function () {
        var self = this,
            txt,
            q = [],
            item_id,
            id_root;


        // to be consistent with template.js
        self.view.html(self.render_data_return_html(self.template, self.data));


        self.bindFormControls();

        // Init formish form
        // self.view.formish();

        //if (this.options.uses_custom_template) { // sets up elements we dont need with a custom template
        self.genericAugmentView();

        /// Form is loaded, we can now adjust form's look
        self.augmentView();
        //}

        //self.register_combination_changes();

        // self.validation_remote_modify();

        self.setValidationRules();

        id_root = '#' + self.options.identifier;
        item_id = self.event.parameters.item_id || 'new';

        if (self.options.auto_fill) {
            self.fill_form(id_root, self.data);
        }

        /* should go after fill_form because the latter sets orig_value
        - in its abscence things behave funny when the vocab request finishes
        instantly because of caching
        */
        self.populateLoadables();

        if (self.options.before_view_shown) {
            self.options.before_view_shown.apply(self);
        }
    };

    // ----------------------------------------------------------------------- //



    Form.prototype.resetForm = function () {
        /*
        * Removes validation messages and resets the form to its initial values
        */
        var self = this,
            validator = self.form.validate();
        if (validator) {
            validator.resetForm();
        } else {
            console.log("Validator is NULL for " + self.form);
        }

    };


    Form.prototype.fill_form = function ( id_root, data, first_lvl ) {
        /* Recursively iterate over the json data, find elements
        * of the form and set their values.
        * Now works with subforms
        */
        if (!first_lvl) {
            first_lvl = true;
        }

        var self = this,
            is_array = function (arg) {
                return (arg && typeof arg === 'object' &&
                        typeof arg.length === 'number' &&
                        !(arg.propertyIsEnumerable('length')));
            };

        if (!data) { return; }
        /*
        stats make pre-filling a form very slow
        TODOXXX: this is kinda a wrong place to deal with this
        */
        delete data.stats;
        delete data.__recently_modified__;

        if (first_lvl) {
            // Fill out data provided by server with defaults provided in the URI

            var mergeobjs = function (obj1, obj2) {
                /*
                Recursively add values from obj2 which are missing in obj1
                into obj1 in-place
                */
                $.each(obj2, function (name, value2) {
                    var value1 = obj1[name];
                    if (value1 === null || typeof value1 === 'undefined') {
                        obj1[name] = value2;
                    }
                    else if (is_array(value1) && is_array(value2) ) {
                        if (!value1.length && value2.length > 0) {
                            obj1[name] = value2;
                        }
                    }
                    else if (typeof value1 === 'object') {
                        mergeobjs(value1, value2);
                    }
                } );
            };
            mergeobjs(data, self.event.uri_args);
        }


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
            //if (value === null || typeof value === 'undefined') {
            //    console.log( self.event.uri_args[name] );
            //    value = self.event.uri_args[name] || '';
            //}

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
                        display_elem.val(webapp.format_date(value));
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
                    console.log("FORM ELEMENT NOT FOUND: ", id, self.options.identifier);
                }
            } else if (is_array(value)) {

                elem = $(id);
                if (elem.length && elem.prop("tagName").toLowerCase() === "select") {
                    elem.data("original_value", value);
                } else {
                    /* Support arrays (aka sc.Sequence) subforms -
                    * need to delete any fields added during the
                    * previous showing of the form
                    */
                    elem = $(id + '--field');
                    link = $(elem.find('a.adderlink'));

                    if (elem.length) {
                        // remove existing fieldsets
                        elem.find('.field').remove();
                        // remove stuff which is not fields (i.e. separators etc.)
                        elem.find('.nonField').remove();

                        // should go before the === "object" section
                        $.each(value, function (idx, subvalue) {
                            self.view.formish('add_new_items', $(link));
                            self.fill_form(id + '-' + idx, subvalue, false);
                        });
                        self.view.formish('add_new_items_header_row', $(link));
                    }
                }

            } else if (typeof value === "object") {
                if (data) {
                    self.fill_form(id, value, false);
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
                            var val = $(this).val();
                            /* multi-edit dialogs may have 'unchanged' value for some listboxes */
                            if (val && val !== 'unchanged') {
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
                    if ($master_elem.val() && $master_elem.val() !== 'unchanged') {
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
            var $select = $(this).find('select'),
                opts = {
                    disable_search_threshold: 3
                };

            if (!$select.hasClass('required')) {
                opts.allow_single_deselect = true;
            }
            opts.inherit_select_classes = true;
            $select.addClass("chosenInitialized").chosen(opts);
            self.hideListbox($select);
            self.reloadLoadable($select);
        });
    };

    Form.prototype.reloadLoadable = function ($select) {
        var self = this,
            from = self.mangle_url(webapp.rest_service_prefix + $select.attr("href"), $select),
            orig,
            ids = {},
            is_array = function (arg) {
                return (arg && typeof arg === 'object' &&
                        typeof arg.length === 'number' &&
                        !(arg.propertyIsEnumerable('length')));
            },
            invalidated_by = $select.data('invalidated_by');

        /// empty 'from' url signals that we shouldn't attempt to load the data
        /// just yet (i.e. a master listbox was not loaded yet)
        if (from) {
            if (!invalidated_by) {
                console.warn("Loadable listbox has no invalidated_by set: " + from);
            }

            webapp.Read(from, invalidated_by).done(function (data) {
                // keep the options marked with class="preserve"
                $select.children(":not(.preserve)").remove();
                if (!$select.children().length) {
                    /* add an empty option for Chosen default text support */
                    $('<option value=""></option>').appendTo($select);
                }

                /// for dependent listboxes, their options are loaded
                /// after the content is loaded, so we need somehow to
                /// set their value after the fact. For this, we store
                /// the original value as "original_value" attribute of every
                /// element. After the listbox has been loaded, we now able
                /// to select the element we need
                orig = $select.data("original_value");

                if (is_array(orig)) {
                    $.each(orig, function(idx, obj) {
                        ids[obj.id] = true;
                    });
                } else {
                    ids[orig] = true;
                }

                $.each(data.items, function (idx, value) {
                    var opt = $("<option/>").val(value[0]).html(value[1]).appendTo($select);
                    if (ids[value[0]]) {
                        opt.attr("selected", "selected");
                    }
                });
                self.showListbox($select);
                /*}*/

                $select.removeData("original_value");
                $select.change();
            });
        }
    };


    Form.prototype.hideListbox = function ($select) {
        /* hides a loadable listbox when it's not yet loaded
           or if it's parent is not selected */

        /// need to clear the listbox so any dependent listboxes
        /// are getting hidden too

        if ($select.data('displaytype') === 'disable') {
            $select.attr('disabled', 'disabled');
            $select.parent().find('.iconAdd').hide(); // hide the add button
        } else {
            $select.parents("div.field").hide();
        }

        $select.val('').change().trigger("liszt:updated");

    };


    Form.prototype.showListbox = function ($select) {
        /// shows a loadable listbox after it's loaded
        /// or if it's parent is selected

        if ($select.data('displaytype') === 'disable') {
            $select.removeAttr('disabled');
            $select.parent().find('.iconAdd').show(); // show the add button
        } else {
            $select.parents("div.listboxContainer").show();
            $select.parents("div.field").show();

        }

        /* Turn dropdown into a chosen select */
        /*if (!$select.hasClass("chosenInitialized")) {
            $select.addClass("chosenInitialized").chosen();
        } else {*/
        $select.trigger("liszt:updated");
        //}

        //$('.chzn-drop .chzn-search input[type="text"]').focus();
        /*$select.next().find('input[type="text"]').focus();*/

    };

    Form.prototype.submitForm = function () {
        /*
        * If self.event.parameters.item_id is present, the method
        * PUTs json-serialized form data to the rest url of that item.
        * Otherwise it uses a 'virtual' item called 'new', i.e.
        * /clients/new.
        */
        var self = this,
            form_data = self.form.serializeObject(),
            item_id = self.event.parameters.item_id || 'new',
            meth = webapp.Update;

        if (self.options.http_method === "POST") {
            meth = webapp.Create;
        }

        meth(self.getRestUrl("", {item_id: item_id}), form_data)
            .done(function (data) {
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

                if (self.event.display_mode) {
                    self.dismiss();
                    if (self.options.before_dismiss) {
                        self.options.before_dismiss.apply(self, [data]);
                    } else if (self.event.popup_success_callback) {
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
                        webapp.popupView(url, "popup");
                    }
                }
            });

        return false;
    };


    webapp.Form = Form;

}(jQuery, webapp));



