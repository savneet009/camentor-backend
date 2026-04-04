export const getMaterials = async (req, res) => {

  res.json({
    materials: [
      {
        subject: "Accounts",
        title: "Journal Entries Guide"
      },
      {
        subject: "Law",
        title: "Business Law Notes"
      }
    ]
  });

};