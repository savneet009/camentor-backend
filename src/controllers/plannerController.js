export const generatePlan = async (req, res) => {

  res.json({
    plan: [
      { day: "Monday", subject: "Accounts", hours: 3 },
      { day: "Tuesday", subject: "Economics", hours: 2 }
    ]
  });

};