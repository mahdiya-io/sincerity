export const GOALS = [
  {
    id: "goal1",
    name: "Goal 1",
    body: "Body text for goal 1",
  },
  {
    id: "goal2",
    name: "Goal 2",
    body: "Body text for goal 2",
  },
  {
    id: "goal3",
    name: "Goal 3",
    body: "Body text for goal 3",
  },
];

export default function GoalCard({ goal }) {
  return (
    <div
      style={{
        background: "#42501F",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          color: "#7E551F",
          fontWeight: "bold",
          fontSize: 16,
          marginBottom: 8,
        }}
      >
        {goal.name}
      </div>
      <div
        style={{
          color: "#B7933F",
          fontSize: 14,
        }}
      >
        {goal.body}
      </div>
    </div>
  );
}
