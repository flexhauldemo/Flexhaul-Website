// netlify/functions/_blobStore.js
//
// Shared helper for getting the leads Blobs store.
//
// Netlify Blobs is supposed to auto-configure itself with zero setup, but
// in practice this sometimes fails in production with:
//   "MissingBlobsEnvironmentError: The environment has not been
//    configured to use Netlify Blobs."
// even on correctly deployed sites — this is a known, fairly common
// Netlify Blobs quirk, not a bug in this code.
//
// The reliable fix is to pass siteID and token explicitly instead of
// relying on auto-detection. That requires two extra environment
// variables in Netlify (Site settings > Environment variables):
//
//   BLOBS_SITE_ID   - Project configuration > General > Project details
//                     > "Project ID" (also known as Site ID)
//   BLOBS_TOKEN     - a Personal Access Token: click your account avatar
//                     (bottom-left) > User settings > Applications >
//                     New access token. Give it a name like
//                     "flexhaul-blobs" and copy the value immediately —
//                     Netlify only shows it once.

const { getStore } = require("@netlify/blobs");

function getLeadsStore() {
  if (process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN) {
    return getStore({
      name: "flexhaul-leads",
      siteID: process.env.BLOBS_SITE_ID,
      token: process.env.BLOBS_TOKEN,
    });
  }
  // Falls back to zero-config auto-detection, which works in some
  // environments (e.g. netlify dev locally). In production, if the two
  // variables above aren't set, this is what throws MissingBlobsEnvironmentError.
  return getStore("flexhaul-leads");
}

module.exports = { getLeadsStore };
