
import time


def sluggish(secs=5):
    print "Sleeping",
    for t in range(1, secs):
        print ".",
        time.sleep(1)

    print "\n"

