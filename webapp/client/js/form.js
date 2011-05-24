(function ($, webapp) {

    function Form(options) {

        /* Options are:
        identifier
        title
        button_title
        rest_service_root
        redirect_after_add
        redirect_after_edit
        */
        this.options = $.extend({
            title: "Add/Edit Item",
            button_title: "Save Changes"
        }, options);

        this.options.data_format = this.options.data_format || this.options.identifier;
    }

    Form.prototype = new webapp.View();



    Form.prototype.decorateView = function () {
        /// this is called by View.init and allows us to
        /// insert arbitrary content into the newly-created
        /// <div class="contentView" />
        /// This happens before the content is loaded
        var self = this;
        self.view.append($('<h1><span class="primaryPageHeading">###</span></h1>'))
            .append($('<div class="formPlaceholder"></div>'));
    };


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
            submitHandler: function (form) {
                self.submitForm();
            }
            });

    };

    Form.prototype.showViewFirstTime = function () {
        var self = this,
            load_from = "/forms/" + self.options.identifier,
            $placeholder;

        self.init();

        $placeholder = self.view.find(".formPlaceholder");

        if (!$placeholder.length) {
            alert("Can't find form placeholder for " + self.options.identifier);
        }

        $placeholder.load(load_from, function () {

            self.genericAugmentForm();

            /// Form is loaded, we can now adjust form's look
            self.augmentForm();

            // and bind stuff
            self.bindFormControls();

            // Set validation
            self.setValidationRules();

            // attach event handlers
            self.setHandlers();

            /// finally we can show the form
            self.showView();
        });

    };


    Form.prototype.genericAugmentForm = function () {
        /// Do stuff we want on every form
        var self = this;

        /// TODO: Add option/condition "add_cancel_link"?
        self.view.find(".actions").append("&nbsp; or &nbsp;<a class=\"formCancelLink\" href=\"#/\">Cancel</a>");

        self.cancelLink = self.view.find("a.formCancelLink");

        /// convert the "fake" fields which are marked with
        /// 'section_title' class into titles
        /*this.view.find(".section_title").each(function () {
            var text = "",
                t = $(this).children("label"),
                st = $(this).children("span.description");
            if (t.length) { text = "<h2>" + t.html() + "</h2>"; }
            if (st.length) { text += '<p class="description">' + st.html() + '</p>'; }

            $(this).replaceWith(text);
        });*/

        self.view.find(".webappPopup").click(function () {
            var $link = $(this),
                hash = webapp.normalizeHash($link.attr("href")),
                context = webapp.getEventContextForRoute(hash);


            context.popup_success_callback = function (added_id) {
                //alert("Success: " + added_id);
                var $select = $link.parent().children("select");
                $select.attr("original_value", added_id);
                self.reloadLoadable($select);
            };

            if (context.mapping) {
                context.mapping.controller.popupView(context.mapping.view, context);
            } else {
                self.showMessage("POPUP VIEW NOT FOUND: " + hash);
            }

            //webapp.controller.popupView(view);
            return false;
        });
        /*
        add_sortables(self.view);
        create_addlinks(self.view);
        add_mousedown_to_addlinks(self.view);
        add_remove_buttons(self.view);
        */

        // Init formish form
        self.view.formish();

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


    // I get called when the view needs to be shown.
    Form.prototype.showView = function () {
        /*
         * title and button_title attributes can be overridden on a per-route
         * basis using route's default_parameters dict:
         *     c.route("/servers/register", new webapp.Form({
         *         title: "Register Existing Server",
         *         identifier: "ServerRegisterForm",
         *         rest_service_root: "/rest/servers/new"
         *     }), {title: "Overridden!", button_title:"Yee-hha!"});
         */
        var self = this,
            title = self.event.parameters.title || self.options.title,
            button_title = self.event.parameters.button_title || self.options.button_title,
            form_title_elem = self.view.find(".primaryPageHeading");



        /// We don't need the form title in a popup because
        /// the popup has its own title
        if (self.event.is_popup) {
            form_title_elem.hide().text("");
            self.cancelLink.click(function () {
                self.view.dialog('close');
                return false;
            });
        } else {
            form_title_elem.show().text(title);
            /// Cancel link points to the page we came from
            self.cancelLink.attr('href', webapp.previousPageUrl());
            self.cancelLink.click(function () {});
        }
        self.view.find("#" + self.options.identifier + "-action").val(button_title);

        self.populateLoadables();
        /// if it's the first showing, DOM does not exist at this point yet
        self.populateForm();

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
            };
        if (!data) { return; }

        $.each(data, function (name, value) {

            var id,
                elem,
                display_elem,
                link;

            if (value === null) {
                value = '';
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
                        display_elem.val(webapp.helpers.calendar_date(value));
                        display_elem.change();
                    } else if (elem[0].tagName.toLowerCase() === 'div') {
                        /// support read-only fields
                        elem.html(value || '&mdash;');
                    } else {
                        elem.val(value);
                        elem.attr("original_value", value);
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

                // should go before the === "object" section
                $.each(value, function (idx, subvalue) {
                    self.view.formish('add_new_items', $(link));
                    self.fill_form(id + '-' + idx, subvalue);
                    //add_new_items(link, self.view);
                });
            } else if (typeof value === "object") {
                if (data) {
                    self.fill_form(id, value);
                }
            }
        });

    };

    Form.prototype.populateForm = function () {

        var self = this,
            item_id,
            id_root;

        // Reset the form.
        self.resetForm();

        self.disableForm();

        id_root = '#' + self.options.identifier;
        item_id = self.event.parameters.item_id || 'new';

        $.Read(self.getRestServiceUrl("with-params", { item_id: item_id }), function (data) {
            self.fill_form(id_root, data);

            // Only show the view after all the data is set.
            webapp.controller.setActiveView(self);
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
                                $elem.parents("div.field").hide();
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

        // hide the loadables until they're loaded
        self.form.find('div.loadableListbox').parents("div.field").hide();

        self.form.find('div.loadableListbox').each(function (idx) {
            var $select = $(this).find('select');
            self.reloadLoadable($select);
        });
    };

    Form.prototype.reloadLoadable = function ($select) {
        var self = this,
            from = self.mangle_url($select.attr("href"), $select);

        /// empty 'from' url signals that we shouldn't attempt to load the data
        /// just yet (i.e. a master listbox was not loaded yet)
        if (from) {
            $.Read(from, function (data) {
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
                $select.val($select.attr("original_value"));
                $select.removeAttr("original_value");
                $select.parents("div.field").show();

                $select.change();
            });
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
            redirect_to = (item_id === 'new') ? self.options.redirect_after_add : self.options.redirect_after_edit;

        $.Update(self.getRestServiceUrl("", {item_id: item_id}), form_data,
            function (data) {
                if (self.event.is_popup) {
                    self.view.dialog("close");
                    if (self.event.popup_success_callback) {
                        self.event.popup_success_callback(data);
                    }
                } else {
                    var url = redirect_to || webapp.previousPageUrl();
                    webapp.relocateTo(url);
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

    webapp.Form = Form;

}(jQuery, webapp));



