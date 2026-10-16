/**
* Error de regla de negocio con su código HTTP asociado.
* El servicio lo lanza y el controlador lo traduce a la respuesta.
* Sin esto todos los errores serian 400, esto los clasifica y permite que el controlador los traduzca a la respuesta HTTP correcta.
*/
export class ReglaNegocioError extends Error {
    constructor(
        message: string,
        public readonly statusCode: 400 | 404 | 409,
    ) {
        super(message);
        this.name = 'ReglaNegocioError';
    }
    }