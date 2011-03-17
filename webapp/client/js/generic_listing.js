
// Add view to the application.

function GenericListing(options){


    this.options = $.extend({
    }, options);

};

GenericListing.prototype = new TemplatedView();
/// see http://phrogz.net/js/classes/OOPinJS.html for details
GenericListing.prototype.constructor = GenericListing;

    
GenericListing.prototype.init = function () {

   /// this is called when the view is first shown
    var self = this,
        node_id = self.options.identifier + '-view',
        $node;

    // this is how to call a 'super' method in JS
    TemplatedView.prototype.init.call(this);

    
    /// find or create the body template container
    node_id = self.options.identifier + '-row-template';
    self.row_template = $("#" + node_id);
    if (!self.row_template.length) {
        application.log("Can't find a node for #" + node_id + ", creating a new one");
        /// Create and append a node if not found
        $node = ($('<script type="text/x-jquote-template" id="' + node_id + '">'));

        $("body").append($node);
        self.row_template = $("#" + node_id);
    }

};

GenericListing.prototype.showViewFirstTime = function (parameters) {

    var self = this,
        load_base_from = "/t/listing.html",
        load_body_from = "/t/" + self.options.identifier + ".html";

    self.init();

    self.template.load(load_base_from, function () {
        self.row_template.load(load_body_from, function () {
            self.showView(parameters);
        });
    });
};

GenericListing.prototype.renderTableBody = function() {
    var self=this;
    var output = self.row_template.jqote({data: self.data, view: self});
    return output;
};

GenericListing.prototype.augmentView = function () {
    var self = this;
    
    function _filter_url(new_attrs) {
    };
    
    function _get_column_id(elem) {
        var result = null;
        $(elem.attr('class').split(' ')).each(function (idx, val) {
            var parts = val.split('-');
            if (parts[0] === "id") {
                result = parts[1];
                return false;
            }
        });
        return result;
    }
    
    // this is how to call a 'super' method in JS
    TemplatedView.prototype.augmentView.call(this);
    
    self.view.find("th.sortable").each(function(ids, val) {
        var $cell = $(this);
        var title = $cell.html();
        var id = _get_column_id($cell);
        alert(id);
        $cell.html('<a href="xxx">'+title+'</a>');
    });
};

