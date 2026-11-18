import { Styleguide } from "./Styleguide";

export const metadata = { title: "Components" };

/**
 * The reference for every screen: each shared component in each of its
 * states. Later screens copy from here.
 */
export default function StyleguidePage() {
  return <Styleguide />;
}
