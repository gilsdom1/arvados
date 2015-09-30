#!/usr/bin/env python

from __future__ import absolute_import, print_function

import calendar
import itertools
import re
import time

ARVADOS_TIMEFMT = '%Y-%m-%dT%H:%M:%SZ'
ARVADOS_TIMESUBSEC_RE = re.compile(r'(\.\d+)Z$')

def arvados_node_fqdn(arvados_node, default_hostname='dynamic.compute'):
    hostname = arvados_node.get('hostname') or default_hostname
    return '{}.{}'.format(hostname, arvados_node['domain'])

def arvados_node_mtime(node):
    return arvados_timestamp(node['modified_at'])

def arvados_timestamp(timestr):
    subsec_match = ARVADOS_TIMESUBSEC_RE.search(timestr)
    if subsec_match is None:
        subsecs = .0
    else:
        subsecs = float(subsec_match.group(1))
        timestr = timestr[:subsec_match.start()] + 'Z'
    return calendar.timegm(time.strptime(timestr + 'UTC',
                                         ARVADOS_TIMEFMT + '%Z'))

def timestamp_fresh(timestamp, fresh_time):
    return (time.time() - timestamp) < fresh_time

def arvados_node_missing(arvados_node, fresh_time):
    if arvados_node["last_ping_at"] is None:
        return None
    else:
        return not timestamp_fresh(arvados_timestamp(arvados_node["last_ping_at"]), fresh_time)

class ShutdownTimer(object):
    """Keep track of a cloud node's shutdown windows.

    Instantiate this class with a timestamp of when a cloud node started,
    and a list of durations (in minutes) of when the node must not and may
    be shut down, alternating.  The class will tell you when a shutdown
    window is open, and when the next open window will start.
    """
    def __init__(self, start_time, shutdown_windows):
        # The implementation is easiest if we have an even number of windows,
        # because then windows always alternate between open and closed.
        # Rig that up: calculate the first shutdown window based on what's
        # passed in.  Then, if we were given an odd number of windows, merge
        # that first window into the last one, since they both# represent
        # closed state.
        first_window = shutdown_windows[0]
        shutdown_windows = list(shutdown_windows[1:])
        self._next_opening = start_time + (60 * first_window)
        if len(shutdown_windows) % 2:
            shutdown_windows.append(first_window)
        else:
            shutdown_windows[-1] += first_window
        self.shutdown_windows = itertools.cycle([60 * n
                                                 for n in shutdown_windows])
        self._open_start = self._next_opening
        self._open_for = next(self.shutdown_windows)

    def _advance_opening(self):
        while self._next_opening < time.time():
            self._open_start = self._next_opening
            self._next_opening += self._open_for + next(self.shutdown_windows)
            self._open_for = next(self.shutdown_windows)

    def next_opening(self):
        self._advance_opening()
        return self._next_opening

    def window_open(self):
        self._advance_opening()
        return 0 < (time.time() - self._open_start) < self._open_for
