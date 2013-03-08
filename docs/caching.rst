webapp caching framework
========================

How caching works in webapp:


Server-side part:
-----------------

On the server, there is a small model which keeps track of when any item of each "entity type" has been changed::

   class LastChangedItem(webapp.Base):
       __tablename__ = 'last_changed'

       item_type = sa.Column(sa.String, primary_key=True)
       modified = sa.Column(sa.DateTime, nullable=False)

By "changed" here we mean "a record has been created" - basically, when a record is created the `last_changed` table is updated (see `KitovuCommon.rec.update_last_changed`)

Then, in `webapp.views.rest`, when returning a response for any method, we're appending `__recently_modified__` and `__recently_modified_timestamp__` keys to the output - the former is the list of all types which had been modified since a particular date (see below), and the latter is a timestamp (see `webapp.views.rest._add_last_changed`)

So, basically, with every response we return a list of types which changed since the last time.


On the client:
--------------

On the client, we have webapp.get_cached_ajax method, which stores every ajax request it creates in webapp.requests_cache object, keyed by the request URL.::

   WebApp.prototype.get_cached_ajax = function (use_cache, invalidated_by, options) {};

The next time the request for the same URL is needed, it is simply returned from the cache, no actual request is made.

The returned object is the same "deferred" returned by jQuery's $.ajax, and it has .done() method (which will fire immediately if the request has finished), and the rest of the normal stuff.

`invalidated_by` is a list of types which, if changed, would require us to re-query the data. Say, if we're loading the list of Tasks which has a list of Labels, a Client and a Project also returned for each Task object, then any change in any of those items would require us to invalidate cache::

    webapp.get_cached_ajax(
      true,
      ['Task', 'TaskLabel', 'Client', 'Project'],
      {
         ...ajax options...
      }
   );

The actual cache invalidation is done by `webapp._purge_cache(invalidated_by, timestamp)` function - whenever it sees `__recently_modified__` key in the data returned by any request, it invalidates all cached requests stored for those types,
and uses `__recently_modified_timestamp__` value to set a cookie which is used by the `webapp.views.rest._add_last_changed` on the server (see above) to only show changes since the last update.

Apart from specifying a type, it is also possible to specify '*' wildcard, in which case the cached request will be purged whenever the server says _any_ change happened.


Views:
------

`Template`, `Listing` and `Partial` views now have 2 additional options: `use_cache` (defaults to `true` and `invalidated_by` (defaults to `*`). It is possible to fine-tune the invalidation rules, for example, we only ever want to re-query the list of Labels if we know somebody has edited them::

   labels_editor:  new webapp.Partial({
       identifier: "rTaskListingLabelsEditor",
       data_format: "rLabelsFilter",
       rest_service_root: "/task_labels/",
       invalidated_by: ['TaskLabel']
   }),

`Form` has `use_cache` set to `false` so it always loads the data from the server.

Loadable listboxes (only the client-side ones, defined in helpers.js) accept an optional `invalidated_by` argument. When missing, it defaults to '*', which is better than what we had previously but still is a bit sub-optimal.


Gotchas:
--------

1. Issuing AJAX requests not via webapp.get_cached_ajax() (using $.ajax etc.) would ignore cache invalidation messages sent by the server, which will result in strange behaviour - for example, if a popup saves its data using $.ajax and tells the parent view to reload, the latter will not update because it'll get its data from the cache.

2. Since the invalidation messages are tied to creating records, items which do not create records (stuff like Industry or PaymentMethod) currently will be cached forever (or, until the app is reloaded)

TODO:
-----

- Need to limit the cache size, at the moment it grows indefinitely (unless an invalidation message arrives).

- if there's been more than a few minutes since the last request, we need to let the request through to make sure nobody else has changed the database since then. Or, alternatively, to issue a separate request to a special view which just returns those __recently_modified__ keys. Or to set a timer after each request which fires each few minutes and fetches cache invalidation messages - the latter seems like the best option.

- Go through routes.js and put `invalidated_by` options.



