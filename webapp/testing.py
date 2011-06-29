##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

import time


def sluggish(secs=5):
    print "Sleeping",
    for t in range(0, secs):
        print ".",
        time.sleep(1)

    print "\n"

def explode():

    raise Exception("You asked us to generate an exception - here it is!")