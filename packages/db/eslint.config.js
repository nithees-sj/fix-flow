import base from '@fixflow/config/eslint';

export default [...base, { ignores: ['generated/**', 'dist/**'] }];
