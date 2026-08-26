import {installBeforeV21,installAfterV21} from './audiovisual-runtime.js';

installBeforeV21();
await import('../../pg21/bootstrap/app.js');
installAfterV21();
