export const startTest = async (req, res) => {
  res.json({
    message: "Test started"
  });
};

export const submitTest = async (req, res) => {
  res.json({
    score: 80,
    total: 100
  });
};