/**
 * multer dipakai FileInterceptor (@nestjs/platform-express) di runtime, tapi
 * @types/multer tidak dipasang — seluruh upload di codebase ini diketik
 * secara struktural inline. Deklarasi ini hanya membuka impor `diskStorage`
 * untuk endpoint backup yang men-stream file besar ke disk alih-alih
 * menampungnya di memori.
 */
declare module 'multer';
