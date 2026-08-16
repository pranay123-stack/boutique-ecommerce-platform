import slugify from 'slugify';

export const toSlug = (input: string): string =>
  slugify(input, { lower: true, strict: true, trim: true });

/**
 * Produce a slug that does not collide with existing ones by appending a
 * numeric discriminator: "silk-scarf", "silk-scarf-2", "silk-scarf-3".
 */
export const uniqueSlug = (base: string, taken: Set<string>): string => {
  const root = toSlug(base);
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
};
