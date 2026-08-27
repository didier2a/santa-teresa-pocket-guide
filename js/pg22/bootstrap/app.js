import {installBeforeV21,installAfterV21} from './audiovisual-runtime.js?v=2.3.1.3';

installBeforeV21();
await import('../../pg21/bootstrap/app.js');
installAfterV21();
