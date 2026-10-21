// Which copy of the playroom this is. Both are stamped when the site is published (see
// .github/workflows/pages.yml); a working copy keeps the placeholders. The grown-ups' corner shows
// them, so a grown-up can tell whether the iPad has the newest copy yet.

export const VERSION = '__VERSION__';
export const PUBLISHED = '__PUBLISHED__';

// Whether this copy was published, rather than served from a working copy.
export const STAMPED = VERSION.indexOf('__') !== 0;
