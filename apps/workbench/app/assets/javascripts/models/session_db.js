// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

window.SessionDB = function() {
    var db = this
    Object.assign(db, {
        discoveryCache: {},
        loadFromLocalStorage: function() {
            try {
                return JSON.parse(window.localStorage.getItem('sessions')) || {}
            } catch(e) {}
            return {}
        },
        loadAll: function() {
            var all = db.loadFromLocalStorage()
            if (window.defaultSession) {
                window.defaultSession.isFromRails = true
                all[window.defaultSession.user.uuid.slice(0, 5)] = window.defaultSession
            }
            return all
        },
        loadActive: function() {
            var sessions = db.loadAll()
            Object.keys(sessions).forEach(function(key) {
                if (!sessions[key].token)
                    delete sessions[key]
            })
            return sessions
        },
        loadLocal: function() {
            var sessions = db.loadActive()
            var s = false
            Object.values(sessions).forEach(function(session) {
                if (session.isFromRails) {
                    s = session
                    return
                }
            })
            return s
        },
        save: function(k, v) {
            var sessions = db.loadAll()
            sessions[k] = v
            Object.keys(sessions).forEach(function(key) {
                if (sessions[key].isFromRails)
                    delete sessions[key]
            })
            window.localStorage.setItem('sessions', JSON.stringify(sessions))
        },
        trash: function(k) {
            var sessions = db.loadAll()
            delete sessions[k]
            window.localStorage.setItem('sessions', JSON.stringify(sessions))
        },
        findAPI: function(url) {
            // Given a Workbench or API host or URL, return a promise
            // for the corresponding API server's base URL.  Typical
            // use:
            // sessionDB.findAPI('https://workbench.example/foo').then(sessionDB.login)
            if (url.indexOf('://') < 0)
                url = 'https://' + url
            url = new URL(url)
            return m.request(url.origin + '/discovery/v1/apis/arvados/v1/rest').then(function() {
                return url.origin + '/'
            }).catch(function(err) {
                // If url is a Workbench site (and isn't too old),
                // /status.json will tell us its API host.
                return m.request(url.origin + '/status.json').then(function(resp) {
                    if (!resp.apiBaseURL)
                        throw 'no apiBaseURL in status response'
                    return resp.apiBaseURL
                })
            })
        },
        login: function(baseURL) {
            // Initiate login procedure with given API base URL (e.g.,
            // "http://api.example/").
            //
            // Any page that has a button that invokes login() must
            // also call checkForNewToken() on (at least) its first
            // render. Otherwise, the login procedure can't be
            // completed.
            document.location = baseURL + 'login?return_to=' + encodeURIComponent(document.location.href.replace(/\?.*/, '')+'?baseURL='+encodeURIComponent(baseURL))
            return false
        },
        logout: function(k) {
            // Forget the token, but leave the other info in the db so
            // the user can log in again without providing the login
            // host again.
            var sessions = db.loadAll()
            delete sessions[k].token
            db.save(k, sessions[k])
        },
        checkForNewToken: function() {
            // If there's a token and baseURL in the location bar (i.e.,
            // we just landed here after a successful login), save it and
            // scrub the location bar.
            if (document.location.search[0] != '?')
                return
            var params = {}
            document.location.search.slice(1).split('&').map(function(kv) {
                var e = kv.indexOf('=')
                if (e < 0)
                    return
                params[decodeURIComponent(kv.slice(0, e))] = decodeURIComponent(kv.slice(e+1))
            })
            if (!params.baseURL || !params.api_token)
                // Have a query string, but it's not a login callback.
                return
            params.token = params.api_token
            delete params.api_token
            db.save(params.baseURL, params)
            history.replaceState({}, '', document.location.origin + document.location.pathname)
        },
        fillMissingUUIDs: function() {
            var sessions = db.loadAll()
            Object.keys(sessions).map(function(key) {
                if (key.indexOf('://') < 0)
                    return
                // key is the baseURL placeholder. We need to get our user
                // record to find out the cluster's real uuid prefix.
                var session = sessions[key]
                m.request(session.baseURL+'arvados/v1/users/current', {
                    headers: {
                        authorization: 'OAuth2 '+session.token,
                    },
                }).then(function(user) {
                    session.user = user
                    db.save(user.owner_uuid.slice(0, 5), session)
                    db.trash(key)
                })
            })
        },
        // Return the Workbench base URL advertised by the session's
        // API server, or a reasonable guess, or (if neither strategy
        // works out) null.
        workbenchBaseURL: function(session) {
            var dd = db.discoveryDoc(session)()
            if (!dd)
                // Don't fall back to guessing until we receive the discovery doc
                return null
            if (dd.workbenchUrl)
                return dd.workbenchUrl
            // Guess workbench.{apihostport} is a Workbench... unless
            // the host part of apihostport is an IPv4 or [IPv6]
            // address.
            if (!session.baseURL.match('://(\\[|\\d+\\.\\d+\\.\\d+\\.\\d+[:/])')) {
                var wbUrl = session.baseURL.replace('://', '://workbench.')
                // Remove the trailing slash, if it's there.
                return wbUrl.slice(-1) == '/' ? wbUrl.slice(0, -1) : wbUrl
            }
            return null
        },
        // Return a m.stream that will get fulfilled with the
        // discovery doc from a session's API server.
        discoveryDoc: function(session) {
            var cache = db.discoveryCache[session.baseURL]
            if (!cache) {
                db.discoveryCache[session.baseURL] = cache = m.stream()
                m.request(session.baseURL+'discovery/v1/apis/arvados/v1/rest').then(cache)
            }
            return cache
        },
        request: function(session, path, opts) {
            opts = opts || {}
            opts.headers = opts.headers || {}
            opts.headers.authorization = 'OAuth2 '+ session.token
            return m.request(session.baseURL + path, opts)
        },
    })
}
