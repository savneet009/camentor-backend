const errorMiddleware = (err, req, res, next) => {

  console.error(err);

  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    message: err.message || "Internal Server Error"
  });

};

export default errorMiddleware;