import {tokenOK} from '../b1/identity.mjs';
import {exactHostRecord} from './contract.mjs';
export const BACKUP_MAX_BYTES=17*1024*1024;
export const BACKUP_CHUNK_BYTES=24*1024;
export const BACKUP_TRANSFER_TTL=120000;
export const BACKUP_MAX_TRANSFERS=2;
export const BACKUP_TYPES=Object.freeze(['HOST_UI_BACKUP_EXPORT','HOST_UI_BACKUP_READ','HOST_UI_BACKUP_UPLOAD','HOST_UI_BACKUP_CHUNK','HOST_UI_BACKUP_PREVIEW','HOST_UI_BACKUP_RESTORE','HOST_UI_BACKUP_CLOSE']);
export function backupByteLengthOK(value){return Number.isSafeInteger(value)&&value>0&&value<=BACKUP_MAX_BYTES;}
export function backupTransferInfoOK(value){return exactHostRecord(value,['ok','transferId','byteLength','chunkBytes','chunkCount'])&&value.ok===true&&tokenOK(value.transferId)&&backupByteLengthOK(value.byteLength)&&value.chunkBytes===BACKUP_CHUNK_BYTES&&value.chunkCount===Math.ceil(value.byteLength/BACKUP_CHUNK_BYTES);}
export function encodeBackupChunk(bytes){if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>BACKUP_CHUNK_BYTES)throw Error('invalid-backup-chunk');return btoa(String.fromCharCode(...bytes));}
export function decodeBackupChunk(data){if(typeof data!=='string'||!data.length||data.length>BACKUP_CHUNK_BYTES/3*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))throw Error('invalid-backup-chunk');const raw=atob(data);if(btoa(raw)!==data||raw.length>BACKUP_CHUNK_BYTES)throw Error('invalid-backup-chunk');return Uint8Array.from(raw,c=>c.charCodeAt(0));}
