import { createTypedClient } from "@superfaceai/one-sdk";
import { starwarsCharacterInformation } from "./types/starwars/character-information";
export { StarwarsCharacterInformationProfile } from "./types/starwars/character-information";
export const typeDefinitions = {
    ...starwarsCharacterInformation
};
export const SuperfaceClient = createTypedClient(typeDefinitions);
export type SuperfaceClient = InstanceType<typeof SuperfaceClient>;
