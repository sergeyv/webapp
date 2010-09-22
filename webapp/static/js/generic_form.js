
    /* Options are:
    identifier
    load_from
    rest_service_root
    redirect_after_add
    redirect_after_edit
    */
    function GenericForm(options){
        this.options = options;
        //alert(identifier);
        this.add_form_title = "Add Item";
        this.edit_form_title = "Edit Item";
        this.add_button_title = "Add Item";
        this.edit_button_title = "Save Changes";
    };


    GenericForm.prototype.init = function(){
         /// this is called _before_ the view is loaded (as the view is loaded on demand)
         /// so the html stuff is not available yet
         var self = this;
         self.view = $( "#"+self.identifier+"-form-container" );
         /// TODO: Create and append a node if not found?

    };


    GenericForm.prototype.bindFormControls = function() {
        var self = this;
        self.form = $( "#"+self.identifier );
        self.controls = {}

        var items = self.form.serializeArray();
        $.each(items, function() {
                self.controls[this.name] = $("#"+self.identifier+"-"+this.name);
            });
    };

    GenericForm.prototype.setValidationRules = function() {
        var self = this;
        var rules = window.application.getValidationRules(self.identifier)
        self.form.validate( { rules: rules,
            submitHandler: function(form) {
                self.submitForm();
            }
        } );

    };

    GenericForm.prototype.showViewFirstTime = function( parameters ) {
        self = this;
        self.view.find(".formPlaceholder").load(self.load_from, function() {

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

    // I get called when the view needs to be shown.
    GenericForm.prototype.showView = function( parameters ){
        var self = this;

        // Show the view.
        self.view.addClass( "activeContentView" );
        self.item_id = parameters.id;
        /// Change the form's title depending on whether we're adding or editing
        if (self.item_id) {
            self.view.find(".formTitle").text(self.edit_form_title);
            self.view.find("#"+self.identifier+"-action").val(self.edit_button_title);
        } else {
            self.view.find(".formTitle").text(self.add_form_title);
            self.view.find("#"+self.identifier+"-action").val(self.add_button_title);
        }
        /// if it's the first showing, DOM does not exist at this point yet
        self.populateForm(self.item_id);

    };


    // ----------------------------------------------------------------------- //


    // I diable the form.
    GenericForm.prototype.disableForm = function(){
        // Disable the fields.
        /*this.fields.name.attr( "disabled", true );
        this.fields.phone.attr( "disabled", true );
        this.fields.email.attr( "disabled", true );*/
    };


    // I enable the form.
    GenericForm.prototype.enableForm = function(){
        // Enable the fields.
        /*this.fields.name.removeAttr( "disabled" );
        this.fields.phone.removeAttr( "disabled" );
        this.fields.email.removeAttr( "disabled" );*/
    };


    // I get called when the view needs to be hidden.
    GenericForm.prototype.hideView = function(){
        this.view.removeClass( "activeContentView" );
    };


    // I reset the contact form.
    GenericForm.prototype.resetForm = function(){
        // Clear the errors.
        //this.clearErrors();

        // Reset the form fields.
        //this.form.get( 0 ).reset();
    };




    GenericForm.prototype.populateForm = function(item_id) {

        var self = this;
        // Reset the form.
        self.resetForm();

        self.disableForm();
        if (! item_id) { return; }

        $.Read(self.rest_service_root+"/"+item_id, function(data) {
            window.application.log("TADA");
            $.each(data, function(name, value) {
                var id = '#' + self.identifier + '-' + name;
                var elem = $(id);
                window.application.log(id + " ===> " + elem);
                $(id).val(value);
            });
        });
    };

    // I submit the form.
    GenericForm.prototype.submitForm = function(){
        var self = this;

        //alert("Submit!");

        var form_data = self.form.serializeObject();
        if (! self.item_id)
        {
            /// It's an "Add user" form
            $.Create(self.rest_service_root+"/", form_data,
                function(data) {
                    // go back to the users listing (this re-queries the listing from the server)
                    window.application.relocateTo(self.redirect_after_add);
                });
        } else {
            /// It's an "Edit user" form
            $.Update(self.rest_service_root+"/"+self.item_id, form_data,
                function(data) {
                    // go back to the users listing (this re-queries the listing from the server)
                    window.application.relocateTo(self.redirect_after_edit);
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

