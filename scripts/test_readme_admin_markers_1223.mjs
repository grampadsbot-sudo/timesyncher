import assert from 'node:assert/strict';
import fs from 'node:fs';

const readme = fs.readFileSync(new URL('../features/README.md', import.meta.url), 'utf8');
assert.equal(readme.includes('<<<<<<<'), false, 'features/README.md still has a conflict start marker');
assert.equal(readme.includes('>>>>>>>'), false, 'features/README.md still has a conflict end marker');
assert.equal(readme.includes('\n=======\n'), false, 'features/README.md still has a conflict separator');
assert.match(readme, /Show test customers/);
assert.match(readme, /Dialog PDF, Keepsake PDF, and Generate/);
console.log('test_readme_admin_markers_1223: ok');
