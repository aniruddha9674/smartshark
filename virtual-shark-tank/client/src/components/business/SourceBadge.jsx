const STYLES = {
  json_ld: { label: "Website", class: "bg-blue-100 text-blue-700" },
  meta_tags: { label: "Website", class: "bg-blue-100 text-blue-700" },
  css_rules: { label: "Website", class: "bg-blue-100 text-blue-700" },
  llm: { label: "AI draft", class: "bg-purple-100 text-purple-700" },
  mca: { label: "MCA", class: "bg-gray-100 text-gray-700" },
  self_declared: { label: "You", class: "bg-green-100 text-green-700" },
};

export default function SourceBadge({ source }) {
  if (!source) return null;
  const style = STYLES[source] ?? { label: source, class: "bg-gray-100 text-gray-700" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${style.class}`}>
      {style.label}
    </span>
  );
}