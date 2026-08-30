import type { Block } from "@/lib/seo/content";
import styles from "./GuideBody.module.css";

/** Walks a guide's `Block[]` and emits one semantic element per block - `h2` a
 *  heading, `p` a paragraph, `ul` a bullet list, in source order.
 *
 *  A server component: these pages are crawl targets, so the prose ships as
 *  static HTML with no client JS. Blocks carry no id, so the array index is the
 *  key - the list is hand-authored and never reordered at runtime. */
export default function GuideBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className={styles.body}>
      {blocks.map((block, i) => {
        if ("h2" in block) return <h2 key={i}>{block.h2}</h2>;
        if ("p" in block) return <p key={i}>{block.p}</p>;
        return (
          <ul key={i}>
            {block.ul.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
