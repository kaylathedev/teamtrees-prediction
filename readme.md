 
# \#TeamTrees Prediction Twitter Bot

This application will tweet the predicted completetion date of the #TeamTrees fundraiser.

The data is stored in `team-trees-history.yaml` and the app computes a best line of fit using a "linear" algorithim. It ignores everything before November 1st *(because most of the huge donations happened in October)*

To run, you must provide your own twitter credentials file. Use the `twitter-credentials.json.sample` as a guide, and remove the `.sample` extension before running.
