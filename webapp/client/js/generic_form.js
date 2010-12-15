
    /* Options are:
    identifier
    rest_service_root
    redirect_after_add
    redirect_after_edit
    */
    function GenericForm(options){
        this.options = $.extend({
            data_format: "default",
            add_form_title: "Add Item",
            edit_form_title: "Edit Item",
            add_button_title: "Add Item",
            edit_button_title: "Save Changes"
        }, options);
    };

    GenericForm.prototype = new GenericView();


    GenericForm.prototype.isAddForm = function(){
        /*
         * Check if we either have 'adding' hint passed to the route
         * or 'adding' parameter specified in the options
         */
        if (self.parameters.adding ||
            self.options.adding) { return true; }
        return false;
    }
    
    GenericForm.prototype.decorateView = function(){
         /// this is called by GenericView.init and allows us to
         /// insert arbitrary content into the newly-created
         /// <div class="contentView" />
         /// This happens before the content is loaded
         var self = this;
         self.view.append($('<h1><span class="formTitle">###</span></h1>'))
            .append($('<div class="formPlaceholder"></div>'));
    };


    GenericForm.prototype.bindFormControls = function() {
        var self = this;
        self.form = $( "#"+self.options.identifier );
        self.controls = {}

        var items = self.form.serializeArray();
        $.each(items, function() {
                self.controls[this.name] = $("#"+self.options.identifier+"-"+this.name);
            });
    };

    GenericForm.prototype.setValidationRules = function() {
        var self = this;
        var rules = window.application.getValidationRules(self.options.identifier)
        self.form.validate( { rules: rules,
            submitHandler: function(form) {
                self.submitForm();
            }
        } );

    };

    GenericForm.prototype.showViewFirstTime = function( parameters ) {
        self = this;
        load_from = "/forms/"+self.options.identifier;

        var $placeholder = self.view.find(".formPlaceholder");
        if (! $placeholder.length) {
            alert("Can't find form placeholder for " + self.options.identifier);
        }
        $placeholder.load(load_from, function() {

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
            self.showView( parameters );
        });

    };


    GenericForm.prototype.genericAugmentForm = function() {
        /// Do stuff we want on every form
        self = this;

        /// TODO: Add option/condition "add_cancel_link"?
        self.view.find(".actions").append("&nbsp; or &nbsp;<a class=\"formCancelLink\" href=\"#/\">Cancel</a>");

        self.cancelLink = self.view.find("a.formCancelLink");

        /// convert the "fake" fields which are marked with
        /// 'section_title' class into titles
        this.view.find(".section_title").each( function () {
            var text = "";
            var t = $(this).children("label");
            var st = $(this).children("span.description");
            if (t.length) { text = "<h2>"+t.html()+"</h2>"; }
            if (st.length) { text += '<p class="description">'+st.html()+'</p>'; }

            $(this).replaceWith(text);
        });

    }

    GenericForm.prototype.augmentForm = function() {
        /*
        Modify the form appearance after it is loaded
        */

        /// do nothing, override in subclasses
    }

    GenericForm.prototype.setHandlers = function() {
        /*
        Attach form handlers which respond to changes in the form_data
        (i.e. to implement dependent controls etc.)
        */

        /// do nothing, override in subclasses
    }


    // I get called when the view needs to be shown.
    GenericForm.prototype.showView = function( parameters ){
        var self = this;

        /// Cancel link points to the page we came from
        self.cancelLink.attr('href', "#/"+window.application.previousPageUrl());

        // Show the view.
        self.view.addClass( "activeContentView" );

        self.parameters = parameters;

        /// Change the form's title depending on whether we're adding or editing

        if (self.isAddForm()) {
            self.view.find(".formTitle").text(self.options.add_form_title);
            self.view.find("#"+self.options.identifier+"-action").val(self.options.add_button_title);
        } else {
            self.view.find(".formTitle").text(self.options.edit_form_title);
            self.view.find("#"+self.options.identifier+"-action").val(self.options.edit_button_title);
        }


        self.populateLoadables();
        /// if it's the first showing, DOM does not exist at this point yet
        self.populateForm();

    };


    // ----------------------------------------------------------------------- //


    // I disable the form.
    GenericForm.prototype.disableForm = function(){
        // Disable the fields.
    };


    // I enable the form.
    GenericForm.prototype.enableForm = function(){
        // Enable the fields.
    };




    // I reset the contact form.
    GenericForm.prototype.resetForm = function(){
        // Clear the errors.
        //this.clearErrors();

        // Reset the form fields.
        //this.form.get( 0 ).reset();
    };




    GenericForm.prototype.populateForm = function() {

        var self = this;
        // Reset the form.
        self.resetForm();

        if (self.isAddForm())
        {
            return;
        }

        self.disableForm();

        $.Read(self.getRestServiceUrl() + "?format="+self.options.data_format, function(data) {
            $.each(data, function(name, value) {
                var id = '#' + self.options.identifier + '-' + name;
                var elem = $(id);
                window.application.log(id + " ===> " + elem);
                if (elem.length)
                {
                    /// support read-only fields
                    if (elem[0].tagName.toLowerCase() == 'div')
                    {
                        elem.html(value || '&mdash;')
                    } else {
                        elem.val(value);
                    }
                } else {
                    window.application.log("NOT FOUND: " +id);
                }
            });
        });
    };

    GenericForm.prototype.populateLoadables = function() {

        var self = this;
        // Reset the form.

        self.form.find('div.loadableListbox').each(function(idx) {
            //$(this).css('border', '2px solid red');
            var $select = $(this).find('select');
            $select.children().remove();
            var from = $select.attr("href");
            $.Read(from, function(data) {
            $.each(data.items, function(idx, value) {
                //window.application.log("Name:" + idx);
                //window.application.log("Value:" +value);
                $("<option />").val(value[0]).html(value[1]).appendTo($select);
            });
        });
        });

        /*$.Read(, function(data) {
            window.application.log("TADA");
            $.each(data, function(name, value) {
                var id = '#' + self.options.identifier + '-' + name;
                var elem = $(id);
                window.application.log(id + " ===> " + elem);
                /// support read-only fields
                if (elem[0].tagName.toLowerCase() == 'div')
                {
                    elem.html(value || '&mdash;')
                } else {
                    elem.val(value);
                }
            });
        });*/
    };

    // I submit the form.
    GenericForm.prototype.submitForm = function(){
        var self = this;


        var form_data = self.form.serializeObject();
        if (self.isAddForm())
        {
            /// It's an Add form
            $.Create(self.getRestServiceUrl(), form_data,
                function(data) {
                    var url = self.options.redirect_after_edit || window.application.previousPageUrl();
                    window.application.relocateTo(url);
                });
        } else {
            /// It's an Edit form
            $.Update(self.getRestServiceUrl(), form_data,
                function(data) {
                    var url = self.options.redirect_after_edit || window.application.previousPageUrl();
                    window.application.relocateTo(url);

                });
        }
        return false;
    };


    /// VOCABULARY STUFF
    /// (not really sure it belongs here)
    GenericForm.prototype.show_add_vocab_value_dialog = function (listbox, url, dialog_title) {
        /// display a dialog to add a value to a vocab (offices, departments etc.)
        listbox.val(0);
        var self = this;
        window.application.dialog.find("input.newValueText").attr("value", "");

        var close_fn = function() { $(this).dialog("close"); };
        var add_fn = function() {
            $.Create(url, {'name': window.application.dialog.find("input.newValueText").attr("value")},
                        function(data) {
                            self.populate_listbox(listbox, data, true);
                    });
            window.application.dialog.dialog('close');
            window.application.dialog.find("button.okButton").unbind("click");
        };


        if (!dialog_title) { dialog_title = "Add New Item"; }
        window.application.dialog
            .dialog('option', 'title', dialog_title )
            .dialog('option', 'buttons', { Cancel:  close_fn, Add: add_fn} )
            .dialog('open');
    };


    GenericForm.prototype.populate_listbox = function (listbox, data, addmore)
    {
        listbox.children().remove();
        listbox.append($('<option/>').attr({value:""}).html(" -- please choose -- "));

        for (var i = 0; i< data.items.length; i++) {
            var d = data.items[i];
            listbox.append($('<option/>').attr({value:d[0]}).html(d[1]));
        }

        if (addmore)
        {
            listbox.append($('<option/>').attr({value:"ADD"}).html("... add another one"));
        }

        /// select the newly-added value or the first one if empty
        var new_id = data.new_id || 0;
        listbox.val(new_id);
    };

    GenericForm.prototype.refresh_listbox_vocab = function (url, listbox, addmore)
    {
        var self = this;
        /// query an id-value list form the server and populate
        /// a listbox
        $.getJSON(url, function(data) {
            self.populate_listbox(listbox, data, addmore);
        });
    }
    /// END VOCABULARY STUFF

