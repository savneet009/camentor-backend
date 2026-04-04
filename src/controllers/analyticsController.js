
export const getAnalytics = async (req, res) => {

  res.json({
    totalTests: 5,
    averageScore: 72,
    strongSubjects: ["Accounts"],
    weakSubjects: ["Law"]
  });

};